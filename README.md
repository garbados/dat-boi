# DatBoi

[![stability](https://img.shields.io/badge/stability-experimental-orange.svg?style=flat-square)](https://nodejs.org/api/documentation.html#documentation_stability_index)
[![npm version](https://img.shields.io/npm/v/@garbados/dat-boi.svg?style=flat-square)](https://www.npmjs.com/package/@garbados/dat-boi)
[![build status](https://img.shields.io/travis/garbados/dat-boi/master.svg?style=flat-square)](https://travis-ci.org/garbados/dat-boi)
[![test coverage](https://img.shields.io/coveralls/github/garbados/dat-boi/master.svg?style=flat-square)](https://coveralls.io/github/garbados/dat-boi)
[![greenkeeper](https://badges.greenkeeper.io/garbados/dat-boi.svg)](https://greenkeeper.io/)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/feross/standard)

A web server that maps P2P [Dat](https://datprotocol.com) archives with arbitrary domain addresses and rehosts them locally. DatBoi maps archive URLs to domain names and serves them on your local machine, facilitating a p2p web behind human-readable addresses without the use of centralized servers or external DNS resolution. Access, create, and share an intentional web!

Here's a usage example:

```bash
$ npm i -g @garbados/dat-boi
$ dat-boi start &
$ dat-boi add home.bovid dat://c33bc8d7c32a6e905905efdbf21efea9ff23b00d1c3ee9aea80092eaba6c4957/
$ curl home.bovid
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">

  <!-- about -->

  <meta name="description" content="Cows are the silent jury in the trial of mankind.">
...
```

DatBoi allows you to bind arbitrary domain names to Dat archives. It rehosts these archives locally so that visiting these domain names with a browser serves content right from your computer. This keeps your traffic private, eliminates network latency, and subverts DNS so you never have to buy another domain.

To do this, DatBoi binds to port 80 and adds entries to your local hostfile that map these domain names to 127.0.0.1. It requires root permissions, such as by running with `sudo`. I hope to find [a better way](https://github.com/garbados/dat-boi/issues/8).

You can also use DatBoi to share your domains with others, and to add their domains to your local instance. Here is an example:

```bash
$ dat-boi add-list [key]
# curl secret.blog
<!DOCTYPE html>
...
```

The goal is to allow people to share content and web applications at human-readable names with friends by relying on each other for domain name resolution rather than centralized or authoritative systems. Visiting sites rehosted by a locally-running instance of DatBoi means your traffic never leaves your computer, and you can visit these sites using any browser that recognizes your hostfile.

## Install

You can install DatBoi with [npm](https://www.npmjs.com/):

```bash
npm i -g @garbados/dat-boi
```

Now you can run `dat-boi`. Try running `dat-boi -h` for usage information.

## Usage

Just run `dat-boi` to get started:

```bash
dat-boi
```

**Note: you will probably need to run `dat-boi` with sudo. Help us find [a better way](https://github.com/garbados/dat-boi/issues/8).**

Once `dat-boi` is running, you can run other CLI commands to update its configuration, such as by adding sites. The running instance watches its config for changes and updates itself accordingly. So, you can immediately start adding sites and sitelists:

```bash
dat-boi add <domain> <url>
dat-boi add-list <url>
```

To daemonify DatBoi on systems that use systemd, you can use [add-to-systemd](https://www.npmjs.com/package/add-to-systemd):

```
# install the helper tool
npm install -g add-to-systemd

# create a systemd entry for dat-boi
add-to-systemd dat-boi --user $(whoami) `which dat-boi`

# start the dat-boi service
sudo systemctl start dat-boi
```

### CLI Usage

Run `dat-boi -h` for help, or `dat-boi [command] -h` for help with a specific command. Or, use this:

#### Options:

- `-c, --config`: Path to a JSON file to use to configure DatBoi. Default: `~/.dat-boi.json`
- `-d, --directory`: Path to a directory in which to store archives and metadata. Default: `~/.dat-boi`
- `-h, --help`: Print usage information and exit.

#### Commands:

- `start [options]`: An alias of the default command. Starts the server. It has some options specific to it:
	- `-p, --port <number>`: Specifies the port for DatBoi to listen on. Defaults to port 80.
    - `-P, --peer`: If set, DatBoi will peer the user's `sites` config as an archive that others can use as a sitelist.
    - `-U, --no-upload`: If set, DatBoi will not upload data to peers. It will only perform downloads.
    - `-D, --no-download`: If set, DatBoi will not download updates for sites and sitelists, and so will be unable to process the addition of sites and sitelists.
    - `-H, --no-hostfile`: If set, Datboi will not attempt to modify the user's hostfile.
    - `-S, -no-server`: If set, Datboi will not activate the web server and instead only peer known archives. Use this to turn DatBoi into a dedicated Dat peer.
- `list`: Lists all sites DatBoi knows about whether via the local sitelist or remote ones.
- `add <domain> <url>`: Add a site that resolves the given domain to the Dat archive behind the given URL.
- `remove <domain>`: Remove a site and its hostfile entry. If no other site references its archive, it will be removed too.
- `add-list <url>`: Add a sitelist and all of its site entries.
- `remove-list <url>`: Remove a sitelist and all of its site entries. Archives which are not referenced by any remaining site are also removed.

## Contributing

DatBoi is under active development right now and shouldn't be considered anything like stable or "production-ready" but it'd make me really happy if you gave it a try. Let me know how it goes!

You can help improve DatBoi: report bugs, request features, and ask questions on the [issues](https://github.com/garbados/dat-boi/issues) page.

## Acknowledgements

DatBoi is a divergent fork of [DatHTTPD](https://github.com/beakerbrowser/dathttpd), which comes from the folks behind [Beaker Browser](https://beakerbrowser.com/). The things they make inspire me often.

## License

[MIT](./LICENSE)
