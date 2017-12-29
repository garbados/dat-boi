'use strict'

// TODO jsdoc

const _ = require('lodash')
const async = require('async')
const express = require('express')
const fs = require('fs')
const hostile = require('hostile')
const http = require('http')
const mkdirp = require('mkdirp')
const Multidat = require('multidat')
const path = require('path')
const rimraf = require('rimraf')
const serveDir = require('serve-index')
const toiletdb = require('toiletdb')
const untildify = require('untildify')
const vhost = require('vhost')
const pkg = require('./package.json')
const debug = require('debug')(pkg.name)

if (process.env.DEBUG) {
  require('longjohn')
}

const HOSTNAME_REGEX = /^(([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])\.)*([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/i
const DAT_REGEX = /^dat:\/\/([0-9a-f]{64})/i

const CFG_PATH = process.env.DATBOI_CONFIG || '~/.dat-boi.json'
const DIR_PATH = process.env.DATBOI_DIRECTORY || '~/.dat-boi'

const DATIGNORE = ['*', '**/*', '!dat.json'].join('\n')
const LOCALHOST = '127.0.0.1'

const DAT_OPTIONS = {}
const NET_OPTIONS = {}

module.exports = class DatBoi {
  constructor (options = { config: CFG_PATH, directory: DIR_PATH }) {
    debug(`Creating new DatBoi with config: ${JSON.stringify(options)}`)
    this.configPath = untildify(options.configPath || CFG_PATH)
    this.directory = untildify(options.directory || DIR_PATH)
    mkdirp.sync(this.directory)
    this.db = toiletdb(this.configPath)
    this.peersites = options.peersites || false
    this.datOptions = _.extend(DAT_OPTIONS, options.dat || {})
    this.netOptions = _.extend(NET_OPTIONS, options.net || {})
    this.port = options.port || 80
  }

  init (done) {
    debug('Initializing...')
    this.app = express()
    async.autoInject({
      db: (done) => {
        this.db.read((err, data) => {
          if (err) return done(err)
          if (Object.keys(data).length === 0) {
            async.series([
              (done) => { this.db.write('sites', {}, done) },
              (done) => { this.db.write('sitelists', [], done) }
            ], done)
          } else {
            done(null, data)
          }
        })
      },
      multidat: (db, done) => {
        let multiDb = toiletdb(path.join(this.directory, 'multidat.json'))
        Multidat(multiDb, this.datOptions, (err, multidat) => {
          this.multidat = multidat
          done(err, multidat)
        })
      },
      peerSiteList: (multidat, done) => {
        this.peerSiteList(done)
      },
      localSites: (multidat, done) => {
        async.waterfall([
          this.db.read.bind(this.db, 'sites'),
          this.loadSites.bind(this)
        ], (err, sites) => {
          this.localSites = sites
          done(err, sites)
        })
      },
      remoteSites: (multidat, done) => {
        async.waterfall([
          this.db.read.bind(this.db, 'sitelists'),
          this.loadSiteLists.bind(this)
        ], (err, sitelists) => {
          this.remoteSites = sitelists
          done(err, sitelists)
        })
      }
    }, done)
  }

  start (done) {
    debug('Starting...')
    async.series([
      this.init.bind(this),
      this.cleanArchives.bind(this),
      (done) => {
        this.server = http.createServer(this.app)
        this.server.listen(this.port, done)
      }
    ], (err) => {
      if (err) return done(err)
      // this.startWatchers()
      done()
    })
  }

  stop (done) {
    debug('Stopping...')
    this.watcher.close()
    async.parallel([
      (done) => {
        async.each(this.multidat.list(), (buf, done) => {
          this.multidat.close(buf, done)
        }, done)
      },
      (done) => {
        this.server.close(done)
      }
    ], done)
  }

  restart (done) {
    debug('Restarting...')
    async.series([
      this.stop.bind(this),
      this.start.bind(this)
    ], done)
  }

  startWatchers () {
    // restart when config changes
    this.watcher = fs.watch(this.configPath)
    this.watcher.on('change', () => {
      this.restart()
    })
    // restart when sitelists change
    let dats = this.multidat.list()
    let tasks = this.siteLists.map((key) => {
      let dat = dats.filter((dat) => { return dat.key.toString('hex') === key })[0]
      return (done) => {
        dat.archive.once('ready', () => {
          dat.archive.metadata.update(() => {
            done()
          })
        })
      }
    })
    async.race(tasks, (err) => {
      if (err) throw err
      this.restart()
    })
  }

  peerSiteList (done) {
    if (this.peersites) {
      let joinDir = path.join.bind(path, this.directory)
      // start peering this.sites
      async.parallel([
        fs.writeFile.bind(fs, joinDir('.datignore'), DATIGNORE, 'utf8'),
        fs.writeFile.bind(fs, joinDir('dat.json'), JSON.stringify({ sites: this.sites }))
      ], (err) => {
        if (err) return done(err)
        this.multidat.create(this.directory, this.datOptions, (err, dat) => {
          if (err) return done(err)
          dat.joinNetwork(this.netOptions)
          dat.importFiles((err) => {
            if (err) return done(err)
            console.log(`Peering sites as archive at dat://${dat.key.toString('hex')}`)
            done()
          })
        })
      })
    } else {
      done()
    }
  }

  loadSites (sites = {}, done) {
    let hostnames = Object.keys(sites)
    if (!hostnames.length) return done()
    let dats = this.multidat.list()
    async.each(hostnames, (hostname, done) => {
      let initSite = (dat, site) => {
        debug(`Initializing ${site.hostname} from ${site.key}`)
        dat.joinNetwork(this.netOptions)
        this.app.use(vhost(site.hostname, DatBoi.createSiteApp(site)))
        done()
      }

      let site = sites[hostname]
      site.hostname = hostname
      DatBoi.validateSiteCfg(site)

      if (site.url || site.directory) {
        hostile.set(LOCALHOST, hostname)
      }
      if (site.url) {
        site.key = site.key || DatBoi.getDatKey(site.url) // TODO use dat-link-resolve instead
        site.directory = site.directory || path.join(this.directory, hostname)
        let dat = dats.find(d => d.key.toString('hex') === site.key)
        if (dat) {
          initSite(dat, site)
        } else {
          let options = _.extend(this.datOptions, { key: site.key })
          this.multidat.create(site.directory, options, (err, dat) => {
            if (err) return done(err)
            initSite(dat, site)
          })
        }
      } else if (site.directory) {
        this.multidat.create(site.directory, this.datOptions, (err, dat) => {
          if (err) return done(err)
          site.key = dat.key.toString('hex')
          site.url = `dat://${site.key}`
          dat.importFiles()
          initSite(dat, site)
        })
      }
    }, (err) => {
      if (err) return done(err)
      done(null, sites)
    })
  }

  loadSiteLists (sitelists, done) {
    let remoteSites = {}
    let dats = this.multidat.list()
    async.each(sitelists, (sitelist, done) => {
      let key = DatBoi.getDatKey(sitelist)

      async.waterfall([
        (done) => {
          var dat = dats.find(d => d.key.toString('hex') === key)
          if (dat) {
            done(null, dat)
          } else {
            let datPath = path.join(this.directory, key)
            let datOptions = _.extend(this.datOptions, { key, sparse: true })
            this.multidat.create(datPath, datOptions, done)
          }
        },
        (dat, done) => {
          dat.joinNetwork()
          this.multidat.readManifest(dat, done)
        },
        (datjson, done) => {
          this.loadSites(datjson.sites, done)
        }
      ], (err, sites) => {
        if (err) return done(err)
        remoteSites[key] = sites
        done()
      })
    }, (err) => {
      done(err, remoteSites)
    })
  }

  /*
  Remove archives not referenced by any site
  and hostfile entries associated with deleted sites.
   */
  cleanArchives (done) {
    let datKeys = this.multidat.list().map((dat) => {
      return dat.key.toString('hex')
    })
    let sites = this.sites
    let keys = sites.map((site) => {
      return site.key
    }).filter((key) => {
      return datKeys.indexOf(key) === -1
    })
    let hostnames = sites.filter((site) => {
      return keys.indexOf(site.key) !== -1
    }).map((site) => {
      return site.hostname
    })
    async.parallel([
      (done) => {
        async.each(keys, (key, done) => {
          async.series([
            this.multidat.close.bind(this.multidat, key),
            rimraf.bind(rimraf, path.join(this.directory, key))
          ], done)
        }, done)
      },
      (done) => {
        async.eachSeries(hostnames, (hostname, done) => {
          hostile.remove(LOCALHOST, hostname, done)
        }, done)
      }
    ], done)
  }

  get sites () {
    let localSites = Object.values(this.localSites)
    let remoteSites = Object.values(this.remoteSites).map((sites) => {
      return Object.values(sites)
    }).reduce((a, b) => { return a.concat(b) }, [])
    return localSites.concat(remoteSites)
  }

  get siteLists () {
    return Object.keys(this.remoteSites)
  }

  addSite (domain, key, options = {}, done) {
    async.waterfall([
      this.db.read.bind(this.db, 'sites'),
      (sites = {}, done) => {
        let site = options
        site.url = key
        sites[domain] = _.extend(sites[domain] || {}, site)
        this.db.write('sites', sites, done)
      }
    ], done)
  }

  removeSite (domain, done) {
    async.waterfall([
      this.db.read.bind(this.db, 'sites'),
      (sites = {}, done) => {
        delete sites[domain]
        this.db.write('sites', sites, done)
      }
    ], done)
  }

  addSiteList (key, done) {
    async.waterfall([
      this.db.read.bind(this.db, 'sitelists'),
      (sitelists = [], done) => {
        let exists = sitelists.indexOf(key) > -1
        if (exists) {
          done()
        } else {
          sitelists.push(key)
          this.db.write('sitelists', sitelists, done)
        }
      }
    ], done)
  }

  removeSiteList (key, done) {
    async.waterfall([
      this.db.read.bind(this.db, 'sitelists'),
      (sitelists = [], done) => {
        let i = sitelists.indexOf(key)
        if (i > -1) {
          sitelists.splice(i, 1)
          this.db.write('sitelists', sitelists, done)
        } else {
          done()
        }
      }
    ], done)
  }

  static createSiteApp (site = {}) {
    var siteApp = express()
    if (site.url) {
      // dat site
      siteApp.get('/.well-known/dat', (req, res) => {
        res.status(200).end('dat://' + site.key + '/\nTTL=3600')
      })
      siteApp.use(express.static(site.directory, {extensions: ['html', 'htm']}))
      siteApp.use(serveDir(site.directory, {icons: true}))
    }
    return siteApp
  }

  static validateSiteCfg (site) {
    if (!HOSTNAME_REGEX.test(site.hostname)) {
      console.log('Invalid hostname "%s".', site.hostname)
      throw new Error('Invalid config')
    }
    if (site.url && !DAT_REGEX.test(site.url)) {
      console.error('Invalid Dat URL "%s". URLs must have the `dat://` scheme and the "raw" 64-character hex hostname.', site.url)
      throw new Error('Invalid config')
    }
    if (!site.url && !site.proxy) {
      console.log('Invalid config for "%s", must have a url or proxy configured.', site.hostname)
      throw new Error('Invalid config')
    }
  }

  static getDatKey (url) {
    return DAT_REGEX.exec(url)[1]
  }

  static get configPath () {
    return CFG_PATH
  }

  static start (configPath, done) {
    let boi = DatBoi.create(configPath)
    boi.start(done)
    return boi
  }

  static create (configPath) {
    return new DatBoi(configPath)
  }
}