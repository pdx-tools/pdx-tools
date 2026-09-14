# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Paradox grand-strategy players, primarily of Europa Universalis IV and Europa Universalis V. The user is usually at a desktop with a dedicated GPU and alt-tabs from the game with a fresh save, or returns after a campaign with a finished one.

Primary jobs, in priority order (confirmed by the maintainer):

1. **Share and tell a story.** Turn a campaign into maps, timelapse videos, screenshots, and charts for an AAR, a Reddit post, a forum thread, or a link sent to friends.
2. **Get useful insights.** Answer questions the in-game ledger buries: institution development pushes, religion swaps, inheritances, events that have not fired yet, mana spent, war casualties, budgets.
3. **Compete on achievements.** Upload a save to the global achievement speedrun leaderboard, verify achievements, and compare runs.

Mobile and integrated-GPU users are a secondary audience. They must be able to get value on the spot, but the experience is not optimized for them.

## Product Purpose

PDX Tools is the web workbench for Paradox save files: drop a save, watch the world unfold. It exists so a player never has to install anything, never has to wait for the game client to launch, and never has to hand the save to a server to learn something from it.

Success is a visitor going from first hearing about the site to their first save analysis with minimum friction, then coming back mid-campaign because it is faster than the in-game ledger, and sharing the result.

## Positioning

- **Everything parses locally.** The save never leaves the browser unless the user chooses to upload and share. The analysis engine (Rust compiled to WebAssembly) ships inside static files, so the core use case survives a backend outage.
- **Second-to-none parse performance.** A simdjson-style tape parser, libdeflate/zstd decompression, and Flatbuffer game assets make a full EU4 save analysis take seconds. Speed is a headline feature, not an implementation detail.
- **Every era stays alive.** Saves from old patches load beside the latest version and can be compared in one place.
- **Evergreen leaderboard.** The achievement speedrun board favors recent patches, so the top of the board does not fossilize.

A neighboring analyzer that uploads the save to a server, or that only supports the current patch, cannot truthfully make these claims.

## Operating Context

- Save files come from the game's save directory. EU4 and EU5 saves can be plaintext or binary/ironman; binary parsing needs token files that are not in the public repo.
- The user often has the game running. The site should be faster to consult than the in-game ledger.
- Typical outputs leave the site: PNG screenshots, WebM/MP4 timelapses, melted (binary to plaintext) saves, chart exports, and shareable links to uploaded saves.
- Sharing and the leaderboard require a Steam login. Local analysis requires no account.
- File watching (re-analyze when the game autosaves) is available on browsers with the File System Access API.
- Community lives on Discord (`https://discord.gg/rCpNWQW`) and GitHub issues. Feedback and feature requests arrive from there.
- Skanderbeg (a third-party EU4 analyzer) saves can be imported at `/eu4/skanderbeg`.

## Capabilities and Constraints

### Game scope (confirmed)

- **EU5 is the future.** New surfaces target EU5 first.
- **EU4 stays first-class.** EU4 keeps full feature parity, its achievement leaderboard, and its upload/share flow.
- **CK3, HOI4, Victoria 3, and Imperator** are supported for melting (binary to plaintext) only. Do not imply analysis features for them.

### Confirmed functionality

- EU4: interactive WebGL2 map with map modes, timelapse recording, charts (mana, budget, casualties, wars, development, ideas, health grid), country details (institutions, inheritance, estates, rulers, leaders, diplomacy, budget), province tables, mod list, AAR text, melting, save upload, achievements pages, user profiles, leaderboard.
- EU5: map with map modes and legend, box select, insight panels, profiles, timeline/timelapse, control panel.
- Account: Steam login, personal save list, API key.
- Static content: docs, blog, changelog, and what's-new, built by the separate `src/docs` Astro site and served under `public/`.

### Binding constraints (confirmed)

- **Local-first, no login for analysis.** Parsing never leaves the browser. Login is only for upload and share. Core analysis must work with the backend down, so no server-side rendering of the analysis surfaces.
- **Desktop-first, mobile must still work.** Dedicated-GPU desktop is the target. Mobile and integrated GPUs must remain usable: textures split at 2816px, `mediump` precision where measured safe.
- **Game-derived colors are truth.** Country, religion, culture, trade-good, and map-mode colors come from game data and must never be restyled. Recognition beats palette coherence.
- **Solo-maintainer budget.** Bus factor is about 1. Prefer fewer, simpler surfaces over ambitious ones that need upkeep. Backend is spartan (Postgres only, no Redis, stateless JWT sessions).
- **Broad browser compatibility.** WebAssembly is required. Secondary features may be limited to browsers that support them (File System Access API). Safari share is low single digits, which justified WebGL2 before Safari supported it.
- **First-run cost.** A parse takes about 1-2 s and the landing for a loaded save is map-first. New stat blocks must be orthogonal to the country panel.

### Terminology

- **Save**: a game save file. **Melt**: convert a binary/ironman save to plaintext. **Map mode**: a map coloring scheme (political, religion, development, and so on). **Timelapse**: a recorded video of the map over game dates. **AAR**: after-action report, the community's campaign write-up. **Institution push**: developing provinces to spawn or spread an institution. **Patch**: a game version; the leaderboard weights recent patches.

### Undecided

- No accessibility standard has been formally adopted. See Accessibility below.
- Whether melt-only games will ever gain analysis surfaces is not decided.

## Brand Commitments

- Name: **PDX Tools** (domain `pdx.tools`). Repo-derived; not a user-stated commitment.
- Tagline in use on the landing page and README: "Explore the world you created." Repo-derived.
- Mark: the compass symbol at `app/components/landing/compass-symbol.webp`. Repo-derived.
- Voice on the landing page is direct, second-person, and game-literate (assumes the reader knows mana, institutions, inheritances).

## Evidence on Hand

- Landing gallery assets: `app/components/landing/` (map, charts, insights, mana, advisor, military rank, tables, melted, games, video with poster).
- Public sample save linked from the landing page: `/eu4/saves/l3mDIfueYIB-gjB0gOliK`.
- Live leaderboard and achievement wall render on the landing page from real uploaded data.
- Architecture diagram: `../../assets/dev/pdx-tools-architecture.png`.
- Design strategy write-up (frictionless, performance, fault-tolerant, spartan): root `README.md`.
- Blog posts on performance investigations are linked from the README.
- **Absent:** no testimonials, press quotes, user counts, or benchmark tables are on hand. Do not fabricate them.

## Product Principles

1. **The save never has to leave the browser.** Every feature must work in the local-only path first; upload is an optional second step.
2. **Faster than the ledger.** If a surface is slower to consult than alt-tabbing to the game, it has failed.
3. **Output is the product.** Maps, timelapses, and charts are exported and shared; they must look right off-site, not only in the app.
4. **Game truth over house style.** Colors, names, and icons from game data are shown as the game shows them.
5. **Build what one person can keep alive.** Prefer one good surface over three that drift.

## Accessibility & Inclusion

No formal standard has been adopted. Existing game-theme tokens were measured to clear WCAG 4.5:1 for text and 3:1 for non-text marks on every game surface; keep that floor. Color is never the only carrier of meaning where game colors are involved, because they cannot be tuned.
