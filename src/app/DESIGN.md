---
name: PDX Tools
description: A cartographer's workbench for Paradox save files — brass instruments over cold slate, dense by design.
colors:
  # ── EU5 world: ground ladder (hue 250, cold slate) ──
  eu5-page: "oklch(15% 0.012 250)"
  eu5-panel: "oklch(18% 0.012 250)"
  eu5-panel-raised: "oklch(22% 0.014 250)"
  eu5-panel-hover: "oklch(26% 0.018 250)"
  eu5-panel-active: "oklch(31% 0.02 250)"
  eu5-overlay: "rgba(8, 11, 16, 0.72)"
  eu5-line: "rgba(255, 255, 255, 0.06)"
  eu5-line-strong: "rgba(255, 255, 255, 0.1)"
  # ── EU5 world: ink ladder (hue 80, warm-neutral) ──
  eu5-ink-100: "oklch(94% 0.018 80)"
  eu5-ink-300: "oklch(81% 0.012 80)"
  eu5-ink-500: "oklch(58% 0.01 80)"
  eu5-ink-700: "oklch(40% 0.01 80)"
  eu5-ink-disabled: "oklch(28% 0.008 80)"
  # ── EU5 world: Cartographer's Brass (hue 78) ──
  brass-100: "oklch(86% 0.092 78)"
  brass-300: "oklch(72% 0.12 78)"
  brass-500: "oklch(58% 0.13 78)"
  brass-soft: "rgba(212, 160, 90, 0.14)"
  brass-line: "rgba(212, 160, 90, 0.55)"
  # ── Status (shared vocabulary, both worlds) ──
  status-good: "#10b981"
  status-warn: "#f59e0b"
  status-err: "#f43f5e"
  status-info: "#38bdf8"
  # ── Chart Plate: categorical, fixed order (see § Charts) ──
  chart-1-verdigris: "#1a9f99"
  chart-2-sanguine: "#bb5e1f"
  chart-3-smalt: "#a17fda"
  chart-4-carmine: "#b76263"
  chart-5-indigo: "#6a8dce"
  chart-6-terre-verte: "#4c8d57"
  chart-7-madder: "#c178a9"
  # ── Chart Plate: ramps ──
  chart-seq-low: "#002b29"
  chart-seq-high: "#3ed0c8"
  chart-ord-low: "#005a56"
  chart-ord-high: "#35c9c2"
  chart-div-warm: "#bb5e1f"  # = chart-2-sanguine
  chart-div-mid: "#25292e"
  chart-div-cool: "#6a8dce"  # = chart-5-indigo
  # ── Chart Plate: in-plot selection (brass; see § Charts) ──
  chart-selection: "#ce9a43"
  # ── Chart Plate: ink and chrome ──
  chart-ink: "#f2eade"
  chart-ink-tick: "#c5c0b8"
  chart-ink-muted: "#7d7a74"
  chart-surface: "#0e1217"
  chart-track: "#161b21"
  # ── Game colour (EU5's own; exempt from the Plate — see § Charts) ──
  game-pop-rural: "#b85c5c"
  game-pop-town: "#8b949e"
  game-pop-city: "#d6a84f"
  game-pop-megalopolis: "#2aa6a1"
  game-building-domestic: "#4e9e6b"
  game-building-foreign: "#c0614a"
  # ── Classic world ──
  classic-primary: "#0284c7"
  classic-primary-hover: "#0ea5e9"
  classic-primary-edge: "#075985"
  shell-slate: "#0f172a"
  marketing-teal: "#134e4a"
  surface-light: "#f8fafc"
  surface-dark: "#1e293b"
  hairline-gray: "#9ca3af"
  ink-dark: "#e2e8f0"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 3vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Public Sans, -apple-system, system-ui, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  ui:
    fontFamily: "Public Sans, -apple-system, system-ui, Segoe UI, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0"
  numeric:
    fontFamily: "IBM Plex Mono, ui-monospace, JetBrains Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0"
    fontFeature: "tabular-nums"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, JetBrains Mono, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.14em"
  label-lg:
    fontFamily: "IBM Plex Mono, ui-monospace, JetBrains Mono, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.14em"
  caption:
    fontFamily: "Public Sans, -apple-system, system-ui, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0"
rounded:
  plate: "2px"
  control: "3px"
  panel: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  row-compact: "28px"
  row-rail: "30px"
  row-tab: "32px"
  row-cozy: "36px"
  panel-inset: "14px"
  shell-header: "64px"
  section-band: "64px"
components:
  game-button-commit:
    backgroundColor: "{colors.brass-300}"
    textColor: "{colors.eu5-panel}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "28px"
  game-button-commit-hover:
    backgroundColor: "{colors.brass-500}"
  game-button-default:
    backgroundColor: "{colors.eu5-panel}"
    textColor: "{colors.eu5-ink-100}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "28px"
  game-button-default-hover:
    backgroundColor: "{colors.eu5-panel-hover}"
  game-button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.eu5-ink-300}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "28px"
  game-button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.eu5-ink-500}"
    rounded: "{rounded.control}"
    height: "28px"
    width: "28px"
  game-input:
    backgroundColor: "{colors.eu5-page}"
    textColor: "{colors.eu5-ink-100}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "28px"
  chip-default:
    backgroundColor: "{colors.eu5-panel-raised}"
    textColor: "{colors.eu5-ink-300}"
    rounded: "{rounded.plate}"
    padding: "2px 8px"
  chip-committed:
    backgroundColor: "{colors.brass-soft}"
    textColor: "{colors.brass-100}"
    rounded: "{rounded.plate}"
    padding: "2px 8px"
  stat-rail-row:
    backgroundColor: "{colors.eu5-panel}"
    textColor: "{colors.eu5-ink-100}"
    typography: "{typography.numeric}"
    padding: "0 12px"
    height: "30px"
  sidebar-item-active:
    backgroundColor: "transparent"
    textColor: "{colors.brass-100}"
    typography: "{typography.ui}"
    padding: "0 14px"
    height: "28px"
  button-primary:
    backgroundColor: "{colors.classic-primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.classic-primary-hover}"
  button-default:
    backgroundColor: "#ffffff"
    textColor: "rgba(0, 0, 0, 0.8)"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card-default:
    backgroundColor: "{colors.surface-light}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: PDX Tools

## Overview

**Creative North Star: "The Cartographer's Workbench"**

PDX Tools is an instrument for reading a world someone else built — their world, made of their decisions, recovered from a save file. The workbench metaphor governs everything: warm brass hardware sitting on cold slate, hairline rules instead of boxes, ledger numerals that line up so a column of values can be read as a column, and controls machined to exactly the size of their job. Nothing on the bench is decorative. Everything on it is calibrated.

The system is deliberately **two sanctioned worlds plus one domain**, and the boundaries are where the user's job changes. The **Classic world** covers the public web: landing, leaderboard, achievements, account, shared saves — lighter, more generous, Tailwind's stock palette over teal marketing bands, built to be legible to someone who arrived from a link. The **Game world** covers in-save analysis — dark, flat, dense, tokenized under `[data-game-theme]`, built for someone who has been staring at a map for forty minutes on a second monitor. These are not a system and its skin. They are two rooms with different work happening in them.

Inside the Game world sits the third domain, the **chart Plate** (§ Charts): the only place many colors legitimately coexist, because data is not chrome. It is bounded rather than free — one tonal register, a fixed slot order, and measured separation gates.

Density is a feature here, not a compromise. The audience reads dense strategy-game UI for fun; the comparison point is the game client itself, not a marketing site. So the Game world runs 28–36px rows, 10–13px type, and hairlines at 6% white, and it is *correct* at that scale. Where other systems would add padding, this one adds information.

The system explicitly rejects three neighbors: **skeuomorphic Paradox chrome** (no faux parchment, no gilded frames, no imitation of the game client's own textures — the tool is adjacent to the game, not cosplaying it), the **generic SaaS dashboard** (no airy card grids, pastel gradients, or marketing-spaced KPI tiles), and the **gamer/RGB aesthetic** (no neon glow, no angular cyberpunk framing, no saturated multi-hue accents in chrome — the Plate's seven pigments are a bounded domain, not a license).

**Key Characteristics:**

- Two sanctioned worlds, split by whether the user is browsing or analyzing, plus the chart Plate inside the Game world
- Brass on slate: exactly one accent hue per world, spent sparingly — brass never enters a plot area except to mark selection
- Chart color is derived and validated against CVD gates, never hand-picked
- Hairline rules and tonal layering carry structure; in the Game world, only surfaces floating over the map are allowed to lift
- Low radii (2–4px in the Game world) — plates, not pills
- Fixed row heights and tabular numerals; columns read as columns
- Uppercase mono micro-labels for section headers, wide-tracked and quiet
- Precise and unfussy: every control is exactly as large as its job

## Colors

Two palettes, one governing instinct: a single accent hue per world, a long neutral ladder to do the actual work, and status color reserved for status.

### Primary

- **Cartographer's Brass** (`brass-300`, oklch(72% 0.12 78)): the Game world's only accent. It marks what is *active, selected, or committed* — the active sidebar item's 2px left bar and its gradient wash, the active tab's underline, the committed chip, the commit button's fill, and every focus ring. `brass-100` is its bright reading (text on dark), `brass-500` its pressed/hover fill, `brass-soft` (14% alpha) its wash, `brass-line` (55% alpha) its hairline and focus ring. Warm, desaturated, closer to unlacquered instrument hardware than to gold leaf.
- **Signal Sky** (`classic-primary`, Tailwind `sky-600`): the Classic world's action color. Primary buttons, links, the announcement bar, and the EU4 map sidebar's hover state. Paired with a darker `sky-800` edge on buttons so the control reads as a plate with a rim rather than a floating fill.

### Neutral

- **Cold Slate ladder** (`eu5-page` → `eu5-panel-active`, oklch 15% → 31% at hue 250): the Game world's five-step ground. Page is the darkest; panels sit one step up; raised panels (section headers, chips, count badges, the expand footer) sit one step above that; hover and active are the top two steps. **Depth is this ladder.** Nothing else provides it.
- **Warm Ink ladder** (`eu5-ink-100` → `eu5-ink-disabled`, oklch 94% → 28% at hue 80): the Game world's five-step text scale. `ink-100` is primary values and active labels; `ink-300` is secondary and resting controls; `ink-500` is the workhorse — micro-labels, metadata, ranks, denominators, placeholder text, and bar fills; `ink-700` and `ink-disabled` are for genuinely inert text. The warm hue is deliberate: it keeps text from going blue-grey against a blue-grey ground.
- **Hairlines** (`eu5-line` at 6% white, `eu5-line-strong` at 10%): every internal division in the Game world. `line-strong` is reserved for the outer edge of a panel and the baseline of a tab list; `line` does everything inside.
- **Shell Slate** (`shell-slate`, Tailwind `slate-900`): the app header, navigation menu surfaces, and the dark-mode page ground. The one element common to both worlds.
- **Marketing Teal** (`marketing-teal`, Tailwind `teal-900`): the landing page's alternating band color, and only that. It is a marketing device, not a brand primary.

### Status

- **Good / Warn / Error / Info** (`emerald-500` / `amber-500` / `rose-500` / `sky-400`): shared across both worlds and used only for genuine state. In the Game world these appear as chip text on a neutral `panel-raised` ground — the chip does not take the status color as a fill.

### Charts — the Plate

Charts are the system's **third sanctioned domain**, beside the Classic and Game worlds. The reasoning is one sentence: *data is not chrome.* A chart is the subject, not the instrument around it, so it does not spend the Game world's single accent, and the one-accent rule that governs panels and controls does not govern the plot area. This resolves the question the system carried open: chart color belongs neither to the game's palette nor to a neutral set, but to a domain of its own, scoped like any other under `[data-game-theme]`.

The source is the **engraved atlas plate** — the data-graphic tradition this audience already reads, and the one place in the workbench's own world where many colors legitimately coexist. The pigments are a colorist's box (verdigris, sanguine, smalt, carmine, indigo, terre verte, madder), held deliberately in one tonal register (OKLCH L .59–.67, C .105–.140) so that seven hues read as one hand's washes rather than as seven competing accents. This is a color *logic*, not a texture: no parchment, no plate marks, no antiquing. The full plate lives in `app/components/viz/echartsTheme.ts` and the tokens in `tailwind.css`.

**Every value is derived and validated, never picked.** Against the panel surface charts render on (`--game-panel`, `#0e1217`): worst adjacent CVD ΔE **11.3** (target ≥8, protanopia/deuteranopia at severity 1.0), worst adjacent normal-vision ΔE **17.4** (floor ≥15), first three slots all-pairs **9.3** CVD / **20.0** normal, contrast **4.2–5.9:1** (all ≥3:1). Re-run the check before changing any value.

- **Categorical** — seven slots in fixed order: verdigris `#1a9f99`, sanguine `#bb5e1f`, smalt `#a17fda`, carmine `#b76263`, indigo `#6a8dce`, terre verte `#4c8d57`, madder `#c178a9`. The order *is* the safety mechanism; assign in sequence, never cycle. Past seven, fold the tail into "Other" or facet — a generated eighth hue would not clear the gates. Forms where any two marks can touch (scatter, heatmap, small multiples) are capped at the **first three slots**, the ones validated all-pairs.
- **Sequential** — magnitude, one hue (slot-1 verdigris), `#002b29` → `#3ed0c8`. The dark ground inverts the anchor: near-zero recedes toward the panel, magnitude climbs toward light.
- **Ordinal** — ordered tiers and buckets, same hue, five steps `#005a56` → `#35c9c2`. Monotone L, adjacent ΔL ≥ 0.06, dark end 2.32:1 on surface.
- **Diverging** — polarity only, and **its poles are Plate slots, not new colors**: sanguine `#bb5e1f` (slot 2, warm) ↔ neutral `#25292e` ↔ indigo `#6a8dce` (slot 5, cool), both used unchanged. Drawing the poles from the box is what stops a polarity chart from looking like it belongs to a different palette than the categorical charts beside it; the interior steps only walk each pole down to a midpoint that sits just above the panel, so "no difference" reads as nothing rather than as a value.
- **Ink and chrome** — values `ink-100`, axis ticks `ink-300`, annotations `ink-500`, grid and axes at the same 6%/10% hairlines used everywhere else.

**Game colour is exempt, and outranks all of the above.** The Plate governs colour the product *invents*. Colour the product *reports* — anything EU5 itself uses — is domain truth and is not subject to the Plate's register, gates, or ramps. This covers the per-entity `colorHex` arriving on countries, religions, goods, and markets from the save, and the values transcribed by hand in `app/features/eu5/gameColors.ts` (settlement ranks, building ownership). A player who has been reading the game client should recognise a rural band or a foreign-owned building instantly; that recognition beats palette coherence every time. An ordered set of game colours stays game-coloured — it does **not** become an ordinal ramp.

There is **no light selection**, by design. `[data-game-theme="eu5"]` carries no `prefers-color-scheme` guard, so the surface is unconditionally dark; a second selection could only drift out of sync with it. (It previously did: charts read the OS preference and served every light-mode user a light palette on a near-black panel.)

### Named Rules

**The Brass Scarcity Rule.** In the Game world, brass appears on at most one element per functional group: one active nav item, one active tab, one commit action. If two things are brass on the same screen, one of them is lying about being active.

**The Ink-500 Rule.** Anything that labels, annotates, or qualifies is `ink-500`. Anything that *is* the answer is `ink-100`. There is no third option — a value is either the data or the frame around it.

**The Status-Is-State Rule.** The four status colors never carry brand, emphasis, or category. A green number means good; it does not mean "positive category." Category color comes from the map's own legend or the chart Plate, never from this palette.

**The Game-Colour Rule.** Colour that EU5 itself assigns is domain truth and outranks the Plate: entity `colorHex` from the save, and the hand-transcribed constants in `gameColors.ts`. Recolouring it to fit the system is a regression even when the result is more coherent, because the tool is read next to the game client and recognition is the point. When a game colour and a Plate colour must sit in one chart, the game colour wins and the Plate colour moves.

**The Reserved Yellow Rule.** Brass owns the yellow region (hue ~60–110) outright, and no chart pigment may enter it. This is measured, not stylistic: no yellow inside the dark band clears brass by the ΔE 15 "never collides at a glance" bar — the closest possible gamboge reaches 13.9 — so the Plate carries **seven** pigments rather than the usual eight. A yellow series would be a series impersonating the selection state.

**The Brass-Is-Selection Rule.** The single exception to "brass never enters the plot area" is *selection itself*: a selected mark wears brass, because brass means selected everywhere else in the shell. This is safe by construction rather than by convention — every pigment was required to clear brass by ΔE ≥ 15, so a brass mark can never be mistaken for a series. The in-plot value is `chart-selection` (`selectionColor` in `echartsTheme.ts`) — brass read as hex for the chart layer, not a second accent.

**The Encoding-Picks-the-Ramp Rule.** The data's job picks the ramp, not the chart's convenience. Identity takes categorical slots; an ordered sequence (tiers, bands, buckets) takes the ordinal ramp so the order is visible in the color; magnitude takes sequential; and anything with two sides of a baseline — surplus/shortage, over/under, positive/negative — takes the diverging poles, never two categorical slots. If swapping two series would change the meaning, it is not categorical. **This rule stops at game colour** — an ordered set the game already colours keeps those colours, per the Game-Colour Rule.

## Typography

**Display / Body Font (Classic world):** the platform sans stack (`ui-sans-serif, system-ui, sans-serif`) — no webfont is loaded on the public web surfaces.
**UI Font (Game world):** Public Sans (with `-apple-system, system-ui, "Segoe UI"` fallback), loaded via Fontsource inside the game shell only.
**Numeric / Label Font:** IBM Plex Mono (with `ui-monospace, "JetBrains Mono"` fallback).

**Character:** Public Sans is a neutral, high-legibility grotesque that survives being set at 12.5px on a dark ground — it has no personality to lose at small sizes, which is exactly the point. IBM Plex Mono carries every number, rank, and section label; its tabular figures are load-bearing, not stylistic. The pairing reads as instrumentation: the sans says what a thing is, the mono says how much of it there is.

### Hierarchy

- **Display** (800, 2.25rem → 3.75rem across `lg`/`xl`, tight leading, `-0.025em`): the landing hero only. Set with `text-balance`, and the second line runs italic as the single expressive typographic gesture in the entire system.
- **Headline** (800, 1.875rem → 2.25rem, `-0.025em`): landing section headers.
- **Title** (500, 17px, 1.25 leading): the Game world's panel identity — the playthrough name in the control panel header. The largest type the Game world ever uses.
- **Body** (400, 1rem–1.25rem, 1.6 leading): landing and docs prose, capped at `max-w-prose`.
- **UI** (400/500, 12.5px, leading-none): every Game world control, tab, nav item, and button. 12px for stat rail labels.
- **Numeric** (400, 10–13px, `tabular-nums`): all values, counts, ranks, dates, shortcuts. Rank ordinals set the suffix as a 7.5px superscript against a 10.5px figure.
- **Label** (500, 9.5–11px, uppercase, `0.14em`–`0.28em` tracking): section headers in the stat rail (10px/0.14em), sidebar sections (9.5px/0.28em), panel titles and rail headers (11px/0.14em), command palette groups (11px/0.15em). Always `ink-500`. 10px and 11px are both real steps — 11px when the label heads a whole panel or rail, 10px when it divides a section inside one.
- **Caption** (400, 11px, 1.4 leading): the sans counterpart to Label — descriptive text under a control, roadmap copy, and chip labels. The one place 11px is set in the UI sans rather than the mono.

### Named Rules

**The Tabular Rule.** Any number a user might compare against another number is set in IBM Plex Mono with `tabular-nums`. This includes ranks, dates, counts, and denominators — not just table columns.

**The Whisper-Label Rule.** Uppercase micro-labels are always the quietest thing on screen: `ink-500`, mono, ≤11px, tracked ≥0.14em. Tracking increases as size decreases — 0.28em at 9.5px, 0.14em at 10–11px. A micro-label that competes with its own content is set wrong.

**The One Italic Rule.** Italic appears exactly once in the system — the landing hero's second line. It is not available as general emphasis.

## Layout

**Classic world.** A centered `max-w-7xl` (1280px) column inside a 64px-tall `slate-900` header bar, with page padding of 20px rising to 36px at `md`. The landing page is a stack of full-bleed alternating bands (`odd:bg-white` / `even:bg-teal-900`) at 64px vertical rhythm, whose paired content sections alternate reading direction at `lg` (`lg:flex-row-reverse` on odd rows) so the eye zig-zags down the page. Bands are separated by a full-width SVG "lip" — a shallow 58px-tall curve that lets the teal rise into the white rather than butting against it. Feature grids run 1 → 2 → 4 columns across `sm`/`xl`. Breakpoints are Tailwind stock: 640 / 768 / 1024 / 1280 / 1536.

**Game world.** A fixed left control panel over a full-bleed map canvas, with floating overlays (toolbar, insight panel, cursor tooltip, selection pill) positioned against viewport insets rather than a document flow. Vertical rhythm is a **row-height system, not a spacing scale**: 28px for controls, nav items, buttons, and inputs; 30px for stat rail rows; 32px for tabs; 36px for sidebar section headers. Horizontal inset is 14px (`px-3.5`) at the panel edge and 12px (`px-3`) inside rails. Panels are `overflow-hidden` with their own internal scroll.

The Game world responds to **container width, not viewport width**. The stat rail is one column by default and reflows to 2 columns at a 720px container and 3 at 1040px, with section headers spanning full width and ragged tails left empty. Column rules are drawn by a `game-line`-colored grid background showing through a 1px gap — so an orphan cell reads as an empty cell, not a broken grid.

### Named Rules

**The Row-Height Rule.** In the Game world, controls get a fixed height from the row scale (28 / 30 / 32 / 36), never vertical padding. Two adjacent controls of the same kind are always the same height, and a row of mixed controls always aligns on a single baseline.

**The Container-Query Rule.** Game world panels are movable and resizable, so their internal layout keys off `@container`, never a media query. A panel dragged narrow must reflow on its own.

## Elevation & Depth

The two worlds have **deliberately different elevation vocabularies**, and this is sanctioned rather than tolerated: each game surface is empowered to run the depth model that suits it.

**Game world: two tiers, and only one of them is allowed to lift.** Surfaces *in the layout* — rails, rows, chips, buttons, tabs, section headers — are strictly flat. Their depth comes entirely from the five-step panel lightness ladder plus hairline borders: a panel is "above" the page because it is lighter, and it is bounded because it has a 10%-white edge. Hover is a step up the ladder (`panel` → `panel-hover`), not a lift.

Surfaces *floating over the map* — the toolbar, cursor tooltip, selection pill, shortcut panel, insight panel, control panel, and select menus — are a separate tier and they lift. Each combines three things together, never one without the others: a translucent ground (`eu5-overlay` at `rgba(8,11,16,0.72)`, or `panel/95`), a `backdrop-blur`, and a shadow sized to the surface (`shadow-lg` for small transients, `shadow-xl` for docked panels, `shadow-2xl` for menus and modals). The blur is what makes the shadow legible against a moving map; a shadow without it reads as dirt on the canvas.

**Classic world: shadows are the vocabulary.** Cards rest at `shadow-md`, floating surfaces (dialogs, popovers, dropdowns, sheets) use `shadow-lg`/`shadow-xl`. This is the incumbent convention and it stays.

### Shadow Vocabulary (Classic world only)

- **Resting** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): cards and panels at rest.
- **Floating** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): dropdowns, popovers, tooltips.
- **Lifted** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): dialogs and sheets over a dimmed page.

### Named Rules

**The Sovereign Game Rule.** Each game's surface owns its own design system, scoped under `[data-game-theme]`. EU5's tokens are not a global default and EU4 is free to establish its own. Shared primitives (Tooltip, Dialog, Table) must read from tokens where a game theme provides them and fall back to Classic values otherwise — never hardcode a game's palette into a shared component.

**The Flat-Until-Floating Rule (Game world).** A shadow on a surface that sits *in* the layout is a bug — move it up the panel ladder and give it a `line-strong` edge instead. A shadow is earned only by leaving the layout to float over the map, and then it arrives as a set: translucent ground + `backdrop-blur` + shadow. Never a shadow on its own.

## Shapes

The form language is **plates, not pills**. The Game world runs three radii and they are all small enough to read as machined edges rather than softness: `plate` (2px) for chips, badges, and inline markers; `control` (3px) for buttons, inputs, and search fields; `panel` (4px) for the outer edge of rails and panels. Progress and bar tracks drop to 1px. The only fully round things in the Game world are 6px status dots and the 2px active-item bar.

The Classic world is softer by a full step: `rounded-md` (6px) for buttons and inputs, `rounded-lg` (8px) for cards, `rounded-xl` (12px) for feature tiles, `rounded-full` for badges and avatar buttons.

Borders are 1px and solid everywhere; the difference between the worlds is opacity, not weight. The Game world's borders are white at 6–10%; the Classic world's are `gray-400` at 50–100%. The landing page's feature tiles invert this with a 4px solid white border on teal — the one place a border is a graphic element rather than a division.

### Named Rules

**The Small-Radius Rule.** No Game world element exceeds 4px radius. If a design calls for a soft, rounded container in a game surface, the design is wrong for the room.

## Components

Everything below is **precise and unfussy**: fixed heights, hairline borders, no ornament. A control does exactly one thing and takes exactly the room it needs.

### Buttons

**Game world** (`GameButton`) — four variants, all 28px tall, 12px horizontal, `control` radius, 12.5px UI type, 1.5 gap between icon and label:

- **Commit:** `brass-300` fill with a `brass-500` edge and `panel`-colored text (dark text on brass — the only inverted control in the system). Hover deepens to `brass-500`. Reserved for the action that changes state.
- **Default:** `panel` fill, `line` edge, `ink-100` text. Hover steps the fill to `panel-hover` *and* the border to `line-strong` — both move together.
- **Ghost:** transparent, `ink-300` text, gaining a `panel-hover` ground on hover.
- **Icon:** 28×28 square, `ink-500` at rest, `ink-100` on hover.
- **Focus:** 1px `brass-line` ring, no offset. **Disabled:** 40% opacity.

**Classic world** (`Button`) — `rounded-md`, 16px × 8px padding, medium weight, 1px solid border on every variant:

- **Primary:** `sky-600` fill, `sky-800` border, white text; hover `sky-500`, active `sky-400`.
- **Default:** white (dark: `slate-700`) fill, `gray-400` border, 80%-black text.
- **Danger:** white fill, `rose-400` border, `rose-800` text — outlined, never filled red.
- **Focus:** 2px ring with a 2px offset against `slate-300/70`. **Disabled:** 50% opacity, `not-allowed` cursor.
- Shapes are orthogonal to variants: `default` (rounded-md, 16×8), `square` (rounded-md, 8), `circle` (rounded-full, 8), `none`.

### Chips

- **Style:** `plate` radius (2px), `panel-raised` ground, `line` border, 11px UI type, 8px × 2px padding, optional 6px leading dot.
- **Variants:** `default` (`ink-300`), `committed` (`brass-soft` ground, `brass-line` border, `brass-100` text, brass dot), and `good`/`warn`/`error` which recolor only the *text and dot* — the ground stays neutral.
- Also serves as the keyboard-shortcut badge inside search fields, set in 10px mono.

### Cards / Containers

- **Game world panels:** `panel` radius (4px), `line-strong` outer border, `panel` ground, `overflow-hidden`, no shadow. A header row divided by a `line` border with an uppercase mono title left and dimmed metadata right.
- **Classic cards:** `rounded-lg`, `gray-400/50` border, `slate-50` (dark: `slate-800`) ground, `shadow-md` at rest.

### Inputs / Fields

- **Game world:** 28px tall, `page`-colored ground (darker than the panel it sits on — inputs recess, they do not raise), `line` border, `control` radius, 12.5px UI type, `ink-500` placeholder. Focus is a 1px `brass-line` ring with no offset; on the search variant the ring is applied via `focus-within` to the wrapper so the ⌕ glyph and shortcut chip sit inside the focused field.
- **Classic:** `rounded-md`, `gray-400` border (dark: `gray-600`), white (dark: `slate-700`) ground, `text-sm`, 2px focus ring with 2px offset.

### Navigation

- **Game world sidebar** (`SidebarNav`): 28px items, 14px inset, 12.5px UI type, `ink-300` at rest. Active state is three simultaneous signals — a 2px `brass-500` bar inset 6px from top and bottom on the left edge, a left-to-right gradient wash from `brass-500/15` to transparent, and `brass-100` medium-weight text. Section headers are 36px tall with a 9.5px mono uppercase label at 0.28em. Optional right-aligned count in 10px mono `ink-500`.
- **Game world tabs:** 32px triggers, 12px inset, `ink-500` → `ink-300` on hover → `ink-100` active, with a 2px `brass-300` underline drawn as an `::after` pinned to the bottom edge of a `line-strong` baseline. Counts ride in a `plate`-radius `panel-raised` badge.
- **Classic header:** 64px `slate-900` bar, 48px app mark plus wordmark (wordmark hidden below `sm`), Radix navigation menus opening onto `slate-900` panels. Social icons sit at 75% opacity and resolve to full on hover and focus.

### Stat Rail (signature component)

The system's clearest expression of the workbench. A rail of metrics on a strict 5-column grid — `16px` icon slot, `1fr` label, `60px` bar, `76px` value, `64px` rank — at 30px per row with `line` dividers and a `panel-hover` row hover.

- The **bar track** is painted only for bounded ratios in [0,1]; raw counts leave the track empty rather than inventing a scale. Track: 4px tall, 1px radius, `line` border, `panel-raised` ground, `ink-500` fill.
- The **value** is right-aligned 12px mono tabular, with an optional dimmed denominator (`88 / 112`) where the `/ 112` is `ink-500`.
- The **rank** is a 10.5px mono ordinal with a 7.5px raised superscript suffix; the cohort size is stated once in the rail header, never per row.
- **Section headers** span all columns on a `panel-raised` ground with top and bottom `line` borders, 10px mono uppercase at 0.14em.
- An optional footer button (`panel-raised`, 12px UI type, ↓ glyph) expands the rail.

### Tooltips

`rounded-md`, `slate-900/90` ground, `gray-100` text, `text-sm`, 12px × 6px padding, `shadow-md`, at `z-1100`. Entry animates `fade-in-0 zoom-in-95` with a 2px directional slide from the trigger side. Portals into the active game-theme container (not `document.body`) so game tokens still resolve.

### Textures (signature detail)

Two hand-made textures exist and are the system's entire ornament budget:

- The landing page's dark-mode ground: a 300° repeating linear gradient over `slate-800` with a low-opacity SVG wave pattern tiled at 100×18.
- The indeterminate progress bar: 135° diagonal stripes alternating `#036ffc` and `#1163cf` every 20px.

## Do's and Don'ts

### Do:

- **Do** pick the world from the user's job, not the route: analyzing a save is the Game world, everything public-facing is the Classic world.
- **Do** scope every new game palette under `[data-game-theme="<game>"]` and consume it through the semantic `--color-game-*` aliases, never the raw `--game-*` variables.
- **Do** give Game world controls a fixed height from the row scale (28 / 30 / 32 / 36) instead of vertical padding.
- **Do** set every comparable number in IBM Plex Mono with `tabular-nums`, including ranks, dates, and denominators.
- **Do** spend brass on one element per functional group, per the Brass Scarcity Rule.
- **Do** express in-layout Game world depth as a step on the panel ladder (`panel` → `panel-raised` → `panel-hover` → `panel-active`) plus a hairline.
- **Do** ship floating Game world surfaces as a complete set: translucent ground, `backdrop-blur`, and a shadow (`lg` transient / `xl` docked / `2xl` menu).
- **Do** move border and background together on Game world hover — `panel` → `panel-hover` *and* `line` → `line-strong`.
- **Do** key Game world panel internals off `@container`, since panels are resizable.
- **Do** recess Game world inputs to `page` color; they sit below their panel, not on it.
- **Do** portal floating Game world content into the theme container so tokens resolve.
- **Do** leave a stat rail bar track empty when the metric has no bounded denominator.
- **Do** take every chart color from the Plate in `echartsTheme.ts`, and assign categorical slots in fixed order from a stable key — never from a sorted position, or a filter will repaint the survivors.
- **Do** re-run the palette validator against `#0e1217` before changing any Plate value, and keep the recorded ΔE figures in § Charts current.
- **Do** give a chart a legend whenever it carries two or more series, and a 2px surface gap between stacked or adjacent fills.

### Don't:

- **Don't** put a shadow on a game surface that sits in the layout. Depth is the ladder; shadows belong only to surfaces floating over the map, and only alongside a translucent ground and a backdrop-blur.
- **Don't** exceed 4px radius in the Game world, or use `rounded-full` on anything but a status dot or the active-item bar.
- **Don't** hardcode a game's palette into a shared component — read tokens, fall back to Classic values.
- **Don't** let a status color carry brand, category, or emphasis; it means state and nothing else.
- **Don't** promote `teal-900` to a brand primary. It is the landing page's band color and belongs to that surface.
- **Don't** set an uppercase micro-label above 11px, below 0.14em tracking, or in anything but `ink-500` mono.
- **Don't** use italic outside the landing hero's second line.
- **Don't** add faux parchment, gilded frames, wax seals, or any imitation of the game client's own UI textures.
- **Don't** reach for the SaaS dashboard reflex — large-radius cards, pastel gradients, or airy KPI tiles with marketing-scale padding.
- **Don't** introduce neon glow, angular cyberpunk framing, or a second saturated accent hue *in chrome*. The chart Plate is the one sanctioned polychrome domain, and it is bounded by its own register and gates — this rule governs panels, controls, and surfaces, not the inside of a plot.
- **Don't** load a webfont on Classic world surfaces; they intentionally run the platform stack.
- **Don't** put a chart color inline in a builder. Every value comes from the Plate; a one-off hex is how the last palette decayed into 41 of them.
- **Don't** color a chart by rank, or re-encode with color what bar length already shows.
- **Don't** replace a game colour with a Plate colour, or fold a game-coloured ordered set into an ordinal ramp — see the Game-Colour Rule.
- **Don't** hardcode a game colour inline. It goes in `gameColors.ts` so the chart and the surrounding readout can never drift apart.
- **Don't** build a dual-axis chart to juxtapose two *independent* measures — that manufactures a correlation out of two arbitrary scale choices. Use two charts, small multiples, or index both to a common base. The one sanctioned exception is a **level and a rate derived from it** (EU5's Revenue bars against Net Margin %, `EconomyTab.tsx`), and it is legal only with all three mitigations present — different mark types so axis binding is unambiguous, both axes named, and **the two zeros aligned in pixel space** (`leftMin = -(f·revMax)/(1-f)`, where `f` is the fraction of the rate's range below zero). Removing the zero alignment is what turns this chart back into the anti-pattern. Note the standing limit: relative steepness between the two series is still arbitrary and must never be read as a claim.
- **Don't** give charts a light selection, or read `prefers-color-scheme` inside the Game world. The surface is unconditionally dark.
- **Don't** leave a series' legend swatch to chance. ECharts cannot resolve a colour *callback* or an unnamed series, and silently falls back to its own default palette — so any series with a callback `itemStyle.color`, or a line series coloured only through `lineStyle`, must also carry an explicit series-level `color`, and every series in a legend needs a `name`.
