<h1 align="center">
<a href="https://pdx.tools">PDX Tools</a>
<br/>
<br/>
  <img src="src/app/src/components/landing/headline.png?raw=true">
</h1>

PDX Tools is a modern [EU4](https://en.wikipedia.org/wiki/Europa_Universalis_IV) save file analyzer that allow users to view maps, graphs, and data tables of their save all within the browser. If the user desires, they can upload the save and share it with the world, while also being elibigle to compete in achievement speedrun leaderboards.

PDX Tools has a modular structure and can be expanded to handle any game. Currently [CK3](https://en.wikipedia.org/wiki/Crusader_Kings_III), [HOI4](https://en.wikipedia.org/wiki/Hearts_of_Iron_IV), and [Imperator](https://en.wikipedia.org/wiki/Imperator:_Rome) saves can also be analyzed, though functionality is limited to just melting (conversion of a binary save to plaintext).

If you'd like to contribute, you've come to the right place! This README should hopefully get you started on your journey. If you get stuck or have a bug report you can [file it here](issues) or chat about it [on the discord](https://discord.gg/rCpNWQW)

## Build Requirements

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

Next come assets. Now, Paradox would be unhappy if the game assets and binary token files were uploaded here, so it is up to you to supply these. For incorporating game assets one can execute:

```bash
just asset-extraction /path/to/your/eu4/installation
```

To start the app:

```bash
just dev
```

This will compile everything and start the web server on two ports: 3001 and 3003. 3001 is plain HTTP and 3003 is HTTPS with a self signed certificate. Since some web features like brotli decoding only work over HTTPS in firefox, it is recommended to use the HTTPS endpoint.

### Ironman saves

By default, ironman and binary files will be unparsable, but one can populate the token files in `assets/tokens` to incorporate binary parsing functionality.
