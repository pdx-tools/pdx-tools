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

## Contributor Guide

If you'd like to contribute, you've come to the right place! This README should hopefully get you started on your journey. If you get stuck or have a bug report you can [file it here](issues) or chat about it [on the discord](https://discord.gg/rCpNWQW)

The best way to get started contributing is to use the [Dev Container](https://code.visualstudio.com/docs/devcontainers/containers) setup with [Visual Studio Code](https://code.visualstudio.com/) (vscode), as it will handle juggling all the system dependencies to ensure your environment matches others. Alternatively, there are instructions for a [manual dev environment](#manual-build-environment) that is less well tested.

To get started with Dev Containers, there is an [official installation guide](https://code.visualstudio.com/docs/devcontainers/containers#_installation) that will have you download and install [Docker](https://docs.docker.com/engine/install/ubuntu/#installation-methods), [vscode](https://code.visualstudio.com/Download), and the [vscode remote development extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.vscode-remote-extensionpack).

Couple of important notes for the installation:

- While Windows and Mac have Dev Container support and should technically work, a Linux host is better supported and will have better performance*. 
- Prefer installing [Docker Engine](https://docs.docker.com/engine/install/ubuntu/) over Docker desktop for best support

After Docker and vscode have been installed with the remote development plugin added to vscode:

- Clone this repo
- Open the repo in vscode
- Either click the tooltip to open in Dev Container or [open manually](https://code.visualstudio.com/docs/devcontainers/tutorial#_check-installation)

After successfully opening the Dev Container the next step is to copy or link your EU4 installation to `assets/game-bundles` and then open a terminal inside vscode to execute:

```bash
just pdx create-bundle "D:/games/steam/steamapps/common/Europa Universalis IV" assets/game-bundles
just pdx compile-assets assets/game-bundles/eu4-1.33.tar.zst
```

See [build assets for more details](#build-assets).

After assets are successfully extracted, one can [start developing](#start-developing)

*: performance in Dev Containers on Windows and Mac can be improved with [this guide](https://code.visualstudio.com/remote/advancedcontainers/improve-performance)


## Build Assets

Paradox would be unhappy if the game assets and binary token files were uploaded here, so it is up to you to supply these. For incorporating game assets one will need a local installation of EU4.

```bash
just pdx create-bundle "D:/games/steam/steamapps/common/Europa Universalis IV" assets/game-bundles
just pdx compile-assets assets/game-bundles/eu4-1.33.tar.zst
```

### Ironman saves

By default, ironman and binary files will be unparsable. If you are in possession of a binary token file, you can unlock processing binary saves by placing the the token file at `./assets/tokens/eu4.txt` and execute:

```bash
just tokenize --eu4-ironman-tokens ./assets/tokens/eu4.txt
```

## Start Developing

To start the app:

```bash
just dev
```

This will compile everything and start the web server on two ports: 3001 and 3003. 3001 is plain HTTP and 3003 is HTTPS with a self signed certificate. Since some web features like brotli decoding only work over HTTPS in firefox, it is recommended to use the HTTPS endpoint.

## Contributor Project Guide

A quick intro into how the repo is structured.

- **app**: The main project directory, a [Next.js](https://nextjs.org/) project. This is where the API, frontend UI, and the bulk of the code live.
- **applib**: Rust library that contains code shared between CLI clients and the backend of the app.
- **applib-node**: [N-API](https://nodejs.org/api/n-api.html#node-api) bindings for app backend to access Rust computations at native speed.
- **blog**: blog contents
- **cli**: CLI used for asset, admin, and user commands
- **eu4game**: Rust library for computing EU4 achievements and for exposing information only found in game files.
- **map**: Project that contains the WebGL2 map shaders and logic for interacting with shaders. It is a standalone module, so that contributors can quickly iterate on shader and WebGL2 implementations without instantiating a dev environment.
- **schemas**: flatbuffer schema for communicating game data efficiently to the browser
- **tarsave**: Utility crate that detects if a eu4 save file has been converted into a tarsave. A tarsave, much like it sounds, is a [tarball](https://en.wikipedia.org/wiki/Tar_(computing)) with every file from a zip transferred into the archive. Tarsaves allow us to transfer the save over the network with a content encoding that can leverage the browser's natively implemented brotli decompression engine, which is faster at inflating than our Wasm zip decompression while having a much better compression ratio.   
- **wasm-br**: Wasm package that takes in a byte array, brotli deflates it, and returns the deflated bytes. This is a standalone package due to how large brotli encoding consumes. Brotli encoding is used when users upload and since most users don't upload, we only want to pay the price to load the brotli module when needed. Maybe one day browsers will expose a JS api so we can use a native brotli deflate implementation.
- **wasm-{{game}}**: Wasm packages dedicated to translating the Rust logic into a Wasm (ie: browser) environment. Each game is a separate package so that users don't need to pay the cost of downloading the logic for every game if they only ever analzye one game.

## Manual Build Environment

If not using vscode and the Dev Container, one can setup an environment manually.

A Linux environment assumed (WSL on Windows untested but probably supported). The following applications must be installed in order to instantiate the dev environment.

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
