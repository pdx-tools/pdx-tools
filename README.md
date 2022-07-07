<h1 align="center">
<a href="https://pdx.tools">PDX Tools</a>
  <br/>
  <a href="https://discord.gg/rCpNWQW"><img alt="Discord" src="https://img.shields.io/discord/712465396590182461?logo=discord&logoColor=white"></a> <a href="https://github.com/pdx-tools/pdx-tools/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pdx-tools/pdx-tools/actions/workflows/ci.yml/badge.svg"></a> 
<br/>
<br/>
  <img src="src/app/src/components/landing/headline.png?raw=true">
</h1>

PDX Tools is a modern [EU4](https://en.wikipedia.org/wiki/Europa_Universalis_IV) save file analyzer that allow users to view maps, graphs, and data tables of their save all within the browser. If the user desires, they can upload the save and share it with the world, while also being elibigle to compete in achievement speedrun leaderboards.

PDX Tools has a modular structure and can be expanded to handle any game. Currently [CK3](https://en.wikipedia.org/wiki/Crusader_Kings_III), [HOI4](https://en.wikipedia.org/wiki/Hearts_of_Iron_IV), and [Imperator](https://en.wikipedia.org/wiki/Imperator:_Rome) saves can also be analyzed, though functionality is limited to just melting (conversion of a binary save to plaintext).

If you'd like to contribute, you've come to the right place! This README should hopefully get you started on your journey. If you get stuck or have a bug report you can [file it here](issues) or chat about it [on the discord](https://discord.gg/rCpNWQW)

## Visual Studio Code (recommended)

The easiest way to contribute is through [Visual Studio Code](https://code.visualstudio.com/) (vscode). After one has installed [Docker](https://docs.docker.com/get-docker/) on a machine, install the [Remote - Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) vscode plugin. Opening this repo inside vscode will give a prompt to reopen the repo inside the container which will have the fully fleshed build environment.

After completing this step, copy or link your EU4 installation to `assets/game-bundles` and execute:

```bash
just create-bundle "D:/games/steam/steamapps/common/Europa Universalis IV" assets/game-bundles
just compile-assets assets/game-bundles/eu4-1.33.tar.zst
```

See [build assets for more details](#build-assets).

After assets are successfully extracted, one can [start developing](#start-developing)

## Manual Build Environment

Linux environment assumed (WSL on Windows untested but probably supported). The following applications must be installed in order to instantiate the dev environment.

- docker
- docker-compose
- node js
- [rust](https://www.rust-lang.org/tools/install)
- [imagemagick](https://imagemagick.org/index.php) with the `convert` command in `$PATH`
- [just](https://github.com/casey/just/releases/latest)

Once the above dependencies are installed, the remaining dependencies can be installed with:

```bash
just setup
```

## Build Assets

Paradox would be unhappy if the game assets and binary token files were uploaded here, so it is up to you to supply these. For incorporating game assets one will need a local installation of EU4.

```bash
just create-bundle "D:/games/steam/steamapps/common/Europa Universalis IV" assets/game-bundles
just compile-assets assets/game-bundles/eu4-1.33.tar.zst
```

### Ironman saves

By default, ironman and binary files will be unparsable, but one can populate the token files in `assets/tokens` to incorporate binary parsing functionality.

## Start Developing

To start the app:

```bash
just dev
```

This will compile everything and start the web server on two ports: 3001 and 3003. 3001 is plain HTTP and 3003 is HTTPS with a self signed certificate. Since some web features like brotli decoding only work over HTTPS in firefox, it is recommended to use the HTTPS endpoint.

## Contributor Project Guide

A quick intro into how the repo is structured.

- **admin**: (production use only) CLI used to prepare data offline to upload to production.
- **app**: The main project directory, a [Next.js](https://nextjs.org/) project. This is where the API, frontend UI, and the bulk of the code live.
- **applib**: Rust library that contains code shared between CLI clients and the backend of the app.
- **applib-node**: [N-API](https://nodejs.org/api/n-api.html#node-api) bindings for app backend to access Rust computations at native speed.
- **assets**: (CI use only) Used to sync assets so that CI can build the repo.
- **blog**: blog contents
- **create-bundle**: (production use only) CLI to create asset bundle from game directory
- **eu4game**: Rust library for computing EU4 achievements and for exposing information only found in game files.
- **map**: Project that contains the WebGL2 map shaders and logic for interacting with shaders. It is a standalone module, so that contributors can quickly iterate on shader and WebGL2 implementations without instantiating a dev environment.
- **packager**: CLI used to process game directory to extract and prepare assets
- **schemas**: flatbuffer schema for communicating game data efficiently to the browser
- **tarsave**: Utility crate that detects if a eu4 save file has been converted into a tarsave. A tarsave, much like it sounds, is a [tarball](https://en.wikipedia.org/wiki/Tar_(computing)) with every file from a zip transferred into the archive. Tarsaves allow us to transfer the save over the network with a content encoding that can leverage the browser's natively implemented brotli decompression engine, which is faster at inflating than our Wasm zip decompression while having a much better compression ratio.   
- **wasm-br**: Wasm package that takes in a byte array, brotli deflates it, and returns the deflated bytes. This is a standalone package due to how large brotli encoding consumes. Brotli encoding is used when users upload and since most users don't upload, we only want to pay the price to load the brotli module when needed. Maybe one day browsers will expose a JS api so we can use a native brotli deflate implementation.
- **wasm-{{game}}**: Wasm packages dedicated to translating the Rust logic into a Wasm (ie: browser) environment. Each game is a separate package so that users don't need to pay the cost of downloading the logic for every game if they only ever analzye one game.
- **wasm-detect**: An under-utilized wasm package that was created as a way to identify save files from bytes. It is under-utilized as the logic is not implemented due to games being identified by file extension.
