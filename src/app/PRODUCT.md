# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a **Paradox grand-strategy analyst and storyteller** — a player who has a save file and wants to understand what actually happened in their world, then tell that story to others. They arrive mid- or post-campaign with a specific question ("could this royal marriage cause an inheritance?", "how much mana went into development?", "how fast did the reformation spread?") or with an AAR to write.

That analyst/storyteller identity is the constant across games. EU4 is the mature, settled game with the deepest feature set; EU5 is the newer surface, and the analyst/storyteller framing must hold just as strongly there rather than reverting to a generic map viewer.

Secondary audiences, both confirmed and both already served:

- **Achievement speedrunners**, who upload completed runs and compete on the leaderboard.
- **Developers**, who use the documented HTTP API and the external CLI to upload saves programmatically.

## Product Purpose

PDX Tools is a browser-based save file analyzer for Paradox grand-strategy games. It turns a save file into maps, timelapses, charts, and data tables without an install and without the save leaving the user's machine.

Success is a user who drops a save and immediately sees something they could not have gotten from the game client — an answer found faster than launching the game, or an artifact (map image, timelapse video, chart, table) good enough to publish in an AAR.

## Positioning

Three things a neighboring product could not truthfully copy:

1. **The save is parsed locally.** WebAssembly parsers run in the browser; nothing is uploaded unless the user deliberately chooses to share. Analysis is private by default, not private by policy.
2. **Analysis lives client-side, so uploaded saves improve retroactively.** Because the engine runs on the viewer's machine rather than at upload time, every previously uploaded save gains new features as the analysis engine gains them. This is an explicit stated philosophy, and it is why the server API is deliberately thin.
3. **The leaderboard is evergreen.** Achievement speedrun rankings are adjusted when new patches release, favoring recent patches, so the board does not calcify around one historical version.

Supporting differentiators: binary ironman saves are melted into human-readable plaintext; saves from old patches load alongside the latest and can be compared in one place; support spans EU4, EU5, CK3, HOI4, Victoria 3, and Imperator.

## Operating Context

Used on a **desktop, as a second screen or an alt-tab** — alongside or between game sessions. Dense, information-rich layouts are appropriate and expected; the user is comparing against the game client itself, which is itself dense.

Typical flows:

- Drop or pick a save file → local parse → explore map, charts, tables, country details.
- Record a timelapse video or capture a map image for an AAR, then export it.
- Melt a binary/ironman save into plaintext and download it.
- Sign in with Steam → upload a save → share a permalink, or enter the achievement leaderboard.
- Open someone else's shared save or user profile from a link.
- Generate an API key on the account page and upload via the API or the external CLI.

Files can be large and parses are non-instant, so progress, loading, and error states are part of the normal path, not edge cases.

## Capabilities and Constraints

**Confirmed capabilities:** save analysis for EU4 (deepest: map modes, charts, country details, watch/live-reload, upload, settings), EU5 (map surface with insight panels, control panel, selection and shortcut affordances, profiles), and melt/decode support for CK3, HOI4, Victoria 3, and Imperator; interactive map with map modes; timelapse video recording; screenshot/image export; data tables and charts; achievement detection and speedrun leaderboard; save upload, sharing, and user profiles; Skanderbeg save viewing; a documented upload API with per-user API keys; a "what's new" changelog surface inside the app.

**Durable constraints — future work must preserve all four:**

- **Local-first parsing.** Saves parse in-browser and never leave the machine unless the user explicitly uploads or shares. This is the product's core trust claim; no design may imply or require otherwise.
- **Modern-browser floor.** Requires WebGL2, WebAssembly, and OffscreenCanvas (`browserslist: defaults and supports webgl2 and supports wasm and supports offscreencanvas`). Unsupported browsers are told so via a browser check rather than being served a degraded fallback experience.
- **No install and no account to start.** Dropping a save must produce full value immediately. Steam sign-in exists only for uploading, sharing, the leaderboard, and API keys — never as a gate on analysis.
- **Free, no advertising, no paywall on core analysis.**

**Technical context:** React Router (framework mode) on Cloudflare Workers, Tailwind v4, Radix UI primitives, TanStack Query/Table/Virtual, ECharts, Zustand, Postgres via Drizzle, Sentry, PostHog. Rust/WASM parsers and a dedicated `@pdx.tools/map` renderer package. Open source (repo: `pdx-tools/pdx-tools`); the docs site and the map playground are separate apps in the same monorepo.

**Terminology (use the product's own words):** *save* / *save file*, *melt* (convert a binary/ironman save into plaintext), *ironman*, *map mode*, *timelapse*, *achievement* and *speedrun leaderboard*, *AAR* (after-action report), *mana* (monarch points), *PU* (personal union). Game names are abbreviated: EU4, EU5, CK3, HOI4, Vic3, Imperator.

**Explicitly undecided:** how much of the EU4 feature depth EU5 should eventually mirror, and whether the two games converge on one shell or keep distinct surfaces, is not settled here. The `data-game-theme` token layer currently allows per-game theming.

## Brand Commitments

- Name: **PDX Tools** (pdx.tools). Formerly Rakaly — historical blog posts still carry that name.
- Tagline in use: **"Explore the world you created."**
- Voice: direct, player-to-player, specific. Copy names real in-game situations rather than generic benefit claims. No hype, no enterprise register.
- Community lives on Discord and GitHub; both are linked from the product.
- Existing assets: landing gallery imagery and video, achievement/game artwork, social card, Steam sign-in button, per-game theme tokens in `app/styles/tailwind.css`.

## Evidence on Hand

Real, usable:

- "1,000,000+ saves analyzed" — already stated on the landing page.
- A public sample save is linked from the landing page for users without a file of their own.
- Live achievement leaderboard and real user profiles.
- Screenshots and a demo video of the actual product in `app/components/landing/`.
- A substantial technical blog and guide archive in `src/docs`.
- Open-source repository and a documented public API.

Do not fabricate: testimonials, named customers, press coverage, pricing, funding, team size, uptime/SLA claims, or user counts beyond the saves-analyzed figure above.

## Product Principles

1. **The save is the subject; the interface is the instrument.** Every surface exists to reveal what happened in the user's world. Chrome that competes with the map, chart, or table is a defect.
2. **Answer before ask.** Value lands before any account, install, or configuration — a dropped file is the whole onboarding.
3. **Privacy is structural, not promised.** Local parsing is the mechanism; the UI should make it evident where data is going at every step, and sharing must always be a deliberate act.
4. **Density is a feature.** The audience reads dense strategy-game UI for fun on a desktop second screen. Optimize for information per screen and fast scanning, not for airy marketing spacing.
5. **Made for storytelling.** Anything a user might want to publish — map, timelapse, chart, table — should be exportable and presentable without editing afterward.
6. **Every era stays alive.** Old patches, old saves, and older games remain first-class; nothing regresses because a newer title shipped.

## Accessibility & Inclusion

No product-specific standard has been established. Baseline expectations that follow from the confirmed constraints: keyboard operability for the non-canvas UI, visible focus, and sufficient contrast in both the light marketing surfaces and the dark in-game themes. Color must not be the only channel carrying meaning in map modes and charts. Confirm with the user before treating any stricter standard as a requirement.
