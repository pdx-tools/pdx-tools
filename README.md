<h1 align="center">
<a href="https://pdx.tools">PDX Tools</a>
  <br/>
  <a href="https://discord.gg/rCpNWQW"><img alt="Discord" src="https://img.shields.io/discord/712465396590182461?logo=discord&logoColor=white"></a> <a href="https://github.com/pdx-tools/pdx-tools/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pdx-tools/pdx-tools/actions/workflows/ci.yml/badge.svg"></a> 
<br/>
<br/>
  <img src="src/app/app/components/landing/gallery-map.webp?raw=true">
</h1>

PDX Tools is a modern [EU4](https://en.wikipedia.org/wiki/Europa_Universalis_IV) save file analyzer that allow users to view maps, graphs, and data tables of their save all within the browser. If the user desires, they can upload the save and share it with the world, while also being elibigle to compete in achievement speedrun leaderboards.

PDX Tools has a modular structure and can be expanded to handle any game. Currently [CK3](https://en.wikipedia.org/wiki/Crusader_Kings_III), [HOI4](https://en.wikipedia.org/wiki/Hearts_of_Iron_IV), [Victoria 3](https://en.wikipedia.org/wiki/Victoria_3), and [Imperator](https://en.wikipedia.org/wiki/Imperator:_Rome) saves can also be analyzed, though functionality is limited to just melting (conversion of a binary save to plaintext).

## Contributor Guide

If you'd like to contribute, you've come to the right place! This README should hopefully get you started on your journey. If you get stuck or have a bug report you can [file it here](issues) or chat about it [on the discord](https://discord.gg/rCpNWQW)

The best way to get started contributing is to use the [Dev Container](https://code.visualstudio.com/docs/devcontainers/containers) setup with [Visual Studio Code](https://code.visualstudio.com/) (vscode), as it will handle juggling all the system dependencies to ensure your environment matches others. Alternatively, there are instructions for a [manual dev environment](#manual-build-environment) that is less well tested.

To get started with Dev Containers, there is an [official vscode installation guide](https://code.visualstudio.com/docs/devcontainers/containers#_installation) that will have you download and install [Docker](https://docs.docker.com/engine/install/ubuntu/#installation-methods), [vscode](https://code.visualstudio.com/Download), and the [vscode remote development extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.vscode-remote-extensionpack).

Couple of important notes for the installation:

- A Linux Docker host is recommended as it has better support and performance, though Windows and Mac hosts can narrow the performance gap if the PDX Tools repo is [cloned in a container volume](https://code.visualstudio.com/remote/advancedcontainers/improve-performance#_use-clone-repository-in-container-volume)
- On Linux, prefer installing [Docker Engine](https://docs.docker.com/engine/install/ubuntu/) over Docker desktop

After Docker and vscode have been installed with the remote development plugin added to vscode, installation can continue:

```bash
# clone the repo
git clone https://github.com/pdx-tools/pdx-tools.git

# open the repo in vscode
code pdx-tools
```

Once the repo is open in vscode, either click the tooltip to open in Dev Container or [open manually](https://code.visualstudio.com/docs/devcontainers/tutorial#_check-installation)

**(non-EU4 contributors can skip to [starting the dev server](#start-server))** The next step is deciding on how to communicate EU4 assets during the compilation stage, as Paradox would be unhappy if the game assets were uploaded to the repo. There are a couple ways of doing this:

- If you're comfortable with docker, modify the docker mounts in `.devcontainer/devcontainer.json` to include the directory where EU4 is installed. Below is an example:
  ```diff
  -    "source=/var/run/docker.sock,target=/var/run/docker.sock,type=bind"
  +    "source=/var/run/docker.sock,target=/var/run/docker.sock,type=bind",
  +    "source=${localEnv:HOME}/.steam/steam/steamapps/common/Europa Universalis IV,target=/tmp/eu4,type=bind,consistency=cached,readonly"
  ```
  After saving, reload the project. You know it's successful once `/tmp/eu4` is visible within the container terminal.
- Alternatively, copy the entire EU4 installation into the cloned directory

Now let's process the EU4 into digestible chunks. In a terminal inside vscode, execute:

```bash
just pdx create-bundle "/tmp/eu4" assets/game-bundles

# The above command outputs a versioned eu4 bundle. In this case 1.34
just pdx compile-assets assets/game-bundles/eu4-1.34.tar.zst
```

After those commands have finished, one can unlink the EU4 assets if desired.

### Start server

To start the PDX Tools:

```bash
just dev
```

This will start the web server on port 3001.

Congrats! You should now be able to see PDX Tools in your browser and be able to parse non-ironman saves.

### Ironman saves

By default, ironman and binary files will be unparsable. If you are in possession of a binary token file, you can unlock processing binary saves by placing the token file at `./assets/tokens/eu4.txt` and execute:

```bash
just tokenize ./assets/tokens
```

## Contributor Project Guide

![PDX Tools architecture](assets/dev/pdx-tools-architecture.png)

### Design Strategy

What follows is **opinionated** documentation for the vision that grounds PDX Tools development and deployment based on past experience.

PDX Tools is a [**frictionless**](#frictionless) web app that features second-to-none [**performance**](#performance) in save file analysis with a [**fault-tolerant**](#fault-tolerant) and [**spartan**](#spartan) backend for hosting files and an achievement leaderboard.

#### Frictionless

There should be minimum friction between a user hearing about PDX Tools and their first save analysis. For that reason, PDX Tools is a web app:

- There is nothing the user needs to download and install
- A web app has less of a chance of being flagged by antivirus
- Sans browser differences, browsers present a unified API for app development with the same look and feel
- Updates are automatically applied whenever the user visits the site

Once the site is loaded, the experience remains frictionless with user registration not required for local save analysis.

To facilitate sharing a save file with others, users can upload the file to the server after logging into Steam. The majority of the gaming user base should already have a Steam account, as Steam is a major distributor of Paradox games.

PDX Tools should strive to be compatible with a large portion of major browsers, so users aren't forced to download and install a specific browser.

- PDX Tools is only possible due to the [ubiquity](https://caniuse.com/wasm) of WebAssembly support.
- Secondary features, like the file watching via the [File System Access API](https://caniuse.com/native-filesystem-api) are fine to be limited to only browsers that support the feature.
- An exception, PDX Tool's WebGL2 map predated the implementation in Safari, but user data showed that Safari usage to be in the low single digits and was determined to be a fine trade-off for this keystone feature.

PDX Tools is geared towards desktop users with a dedicated GPU, however mobile users and integrated GPU users should still be able to use PDX Tools, so they don't need to wait until they are at a more powerful computer to derive value.

- The native texture size in PDX Tools is 5632px wide, but lower end GPUs may only have a max texture size of 4096, so the textures are split into two 2816px images and stitched together at runtime.
- The width of the default float point precision (`mediump`) is often 32 bits on dedicated GPUs but 16 bits elsewhere. Instead of annotating with high precision (`highp`) and suffering performance consequences, meticulous device testing teased out exactly where high precision was necessary.

#### Fault-tolerant

While PDX Tools receives invaluable community contributions via knowledge sharing and suggestions, the site is first and foremost a side project with a bus factor approaching 1. Therefore, everything should be built such that in the event of a catastrophe (eg: backend goes down or service billing issues) the main use case of save file analysis is not impeded.

Ensuring the site can be composed of static files onto a CDN is a cheap (ie: free) way to introduce fault tolerance. By embedding the file analysis engine inside static files, client side compute is leveraged for local and remote files. The backend plays no role in analysis. The static files contain the code and S3 contains the data.

PDX Tools is a heavily aligned SPA; everything takes place inside a single view, so no one can fault the reliance on React to drive the UI. And no one can fault Next.js usage to statically render pages and provide an API to coordinate authentication and database actions. Server side rendering is avoided as that would necessitate the backend being healthy.

Increasing fault tolerance further seems to have doubtful value. It is ok to have a dependency on the domain name and internet connection.

#### Performance

Countless hours have been spent optimizing every level of the PDX Tools stack. Rust is a major component in the performance story, not because it is inherently fast, but it allows one the ability to eke out every last bit of performance while still being ergonomic and less error prone.

At the lowest level, the save file parser is modeled after the tape-based library [simdjson](https://github.com/simdjson/simdjson), known for parsing JSON at gigabytes per second. All performance hypotheses are executed against realistic benchmarks. Profiling via valgrind and kcachegrind have been invaluable in pinpointing potential performance hot spots.

Failed optimization hypotheses like rewriting the [parsing loop to use tail calls](https://blog.reverberate.org/2021/04/21/musttail-efficient-interpreters.html) led to the discovery that patterns in the data can be exploited to make the branch predictor much more successful.

Doing less work is often more performant, so users of the parsing library can opt into parsing and deserializing in a single step which allows the parser to skip data unnecessary for deserialization.

The parser is routinely fuzzed as new optimizations may uncover undefined and potentially unsafe behavior.

The performance characteristics of native code do not always translate to Wasm. PDX Tools stressed Chromium's allocator and a [bug was filed](https://bugs.chromium.org/p/chromium/issues/detail?id=1294262) as it was 100x slower than Firefox on certain platforms. Within a span of a month, Chromium's team identified and fixed the issue.

Save files are Deflate zip files. Profiling showed the DEFLATE algorithm as a major contributor so an [investigation was launched](https://nickb.dev/blog/deflate-yourself-for-faster-rust-zips/) which found removing abstractions yielded a 20% increase in read throughput and switching to libdeflate had an 80% improvement.

Deflate is no longer state of the art. [An exploration](https://nickb.dev/blog/there-and-back-again-with-zstd-zips/) into comparing Deflate zips, with Brotli tarballs and Zstd zips showed that Zstd at level 7 could reduce the payload by half without significant latency and app bloat when embedded in Wasm. Reducing the storage and bandwidth requirements by half is a win that can't be understated.

The game assets required are dependent on the version of the game a save file is from. To facilitate concurrent initialization of game assets, PDX Tools peeks at the save file to determine the game version, reports it out, and then parses the entire file while game assets are fetched and decoded.

Game data assets are encoded with Flatbuffers and then zstd compressed. Flatbuffer offers zero-cost deserialization, and zstd offers the best combination of compression ratio and performance. However, Flatbuffers data accessors are not zero cost so data that is accessed in a hot loop, like game token data, is slurped into a Rust-native `Vec`. Since the end result is a native `Vec`, 30% space savings was realized without a performance hit when token data was encoded in a custom format that omitted the overhead that Flatbuffers adds to support random access.

All uploaded files need to be reparsed on the server to verify data. Parsing files is the most intense action on the backend, and removing the responsibility would allow backend deployment on even the most trivial of instances. It was decided to spin the parsing functionality into its own microservice, but the memory requirements (1 GB) proved too much for [many cost efficient hosts](https://nickb.dev/blog/too-edgy-a-serverless-search/). In the end, Rust and GCP's Cloud Run proved a great match with its low cold start latency and elastic scaling.

#### Spartan

In an effort to keep the backend simple and cost efficient, the backend can be considered spartan. Both the Postgres database and the backend for interoperating with it have been designed to be self-hosted on the same instance.

Redis is conspicuously missing from the architecture. It would be a good fit with [sorted set guides](https://redis.io/docs/data-types/sorted-sets/) and [use cases](https://redis.com/solutions/use-cases/leaderboards/) catering directly to leaderboards. It also would be perfect as a session store to know whether a user session is still valid. Redis is missing as two databases are harder to manage than one. We can [fashion a leaderboard out of Postgres](https://nickb.dev/blog/favoring-sql-over-redis-for-an-evergreen-leaderboard/), and session reuse after logout is not a large enough threat vector so stateless JWT tokens are an ok compromise for user sessions.

Self-hosted Postgres is the database of choice for persisting data related to users and their saves. CRUD operations play an important but small role, and scalability is not a concern. Hosted databases like RDS or Neon charge for instance hours and would be an outsized cost on the service. Alternative providers that use DB size and rows read like PlanetScale, are attractive but would require a migration to MySQL, which, while an adequate database, is something to consider if database scalability becomes a concern.

One could make the argument that the database could be even easier to manage if SQLite was used, which would make the data housed in a single file and eligible for global replication services like Turso and the upcoming Cloudflare D1. Besides database scalability not being a current concern, SQLite's lack of efficient array indexing would require a schema change to add a table for achievement leaderboard calculations, and having only one row in one table for each uploaded save would be tough to give up.

File storage is cost efficient when using low cost S3 compatible services like Backblaze B2 and Wasabi, which offer 1 TB of storage for $6 and $7 per month respectively, and much cheaper (or even free) egress. For PDX Tools, Backblaze B2 is sufficient and the egress fees shouldn't apply as S3 file retrieval is proxied through the edge at Cloudflare, which is a bandwidth alliance partner (and additionally caching headers can be appropriately customized).

Uploaded files are sent to S3 through the backend. This may be surprising, as when talking about uploading user content to S3, the default recommendation is to always use a presigned URL so that the user uploads directly to S3, bypassing the backend. However, the simplicity of sending files through the backend to be parsed and persisted to the database in the same step as the upload should not be underestimated. Even though this required splitting Next.js hosting between providers to avoid the Vercel body limit, this compromise has still been worth it. Read the [dedicated article](https://nickb.dev/blog/split-nextjs-across-hosting-providers-and-advocate-for-direct-s3-uploads/) for more information.

## EU4 new dlc instructions

 - Generate [province terrain mapping](https://pdx.tools/blog/calculating-eu4-province-terrain):
   - Start new normal game as France
   - [Run](https://eu4.paradoxwikis.com/Run_files) [`terrain-script.txt`](assets/game/eu4/common/terrain-script.txt)
   - Save file as `terrain-<major.minor>.eu4`
   - Upload file to `terrain` directory in the eu4saves-test-cases S3 bucket
 - Generate game bundle for repo
   - Can be done from linux or windows (I needed to launch steam from the terminal in linux with `steam -cef-disable-gpu`)
   - Assuming EU4 is found at `/tmp/eu4`, create a game bundle:
     ```
     just pdx create-bundle "/tmp/eu4" assets/game-bundles
     ```
   - Upload the new entry in assets/game-bundles to the game-bundles directory in the pdx-tools-build S3 bucket
   - `just package-all`
 - Update achievement detection logic with any changes
 - Add new 1444 entry for patch
 - Generate binary tokens

## Manual Build Environment

If not using vscode and the Dev Container, one can setup an environment manually.

A Linux environment assumed (WSL on Windows untested but probably supported). The following applications must be installed in order to instantiate the dev environment.

- docker
- [imagemagick](https://imagemagick.org/index.php) with the `convert` command in `$PATH`

It is recommended to use [`mise`](https://mise.jdx.dev/getting-started.html) to ease installation of remaining dependencies, which can be installed and scoped to the pdx-tools repo via `mise install`. Otherwise see the dependencies and versions to install listed in the [config](./.config/mise.toml).
