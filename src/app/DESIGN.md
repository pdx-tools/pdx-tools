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
  eu5-ink-500: "oklch(68% 0.012 80)"
  eu5-ink-rule: "oklch(58% 0.011 80)" # hairlines under text, not a text step
  eu5-ink-700: "oklch(40% 0.01 80)"
  eu5-ink-disabled: "oklch(28% 0.008 80)"
  # ── EU5 world: Cartographer's Brass (hue 78) ──
  brass-100: "oklch(86% 0.092 78)"
  brass-300: "oklch(72% 0.12 78)"
  brass-500: "oklch(58% 0.13 78)"
  brass-soft: "rgba(212, 160, 90, 0.14)"
  brass-line: "rgba(212, 160, 90, 0.55)"
  brass-focus: "oklch(72% 0.12 78)" # focus ring; solid, pinned to the 3:1 floor
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
  timeline-play:
    backgroundColor: "{colors.eu5-panel-raised}"
    textColor: "{colors.eu5-ink-100}"
    rounded: "{rounded.full}"
    height: "32px"
    width: "32px"
  timeline-play-active:
    backgroundColor: "rgba(212, 160, 90, 0.2)"
    textColor: "{colors.brass-100}"
    rounded: "{rounded.full}"
    height: "32px"
    width: "32px"
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
- Motion settles rather than springs: one ease family, 90–420ms glides, and every authored animation carries a reduced-motion branch that keeps the state change

## Colors

Two palettes, one governing instinct: a single accent hue per world, a long neutral ladder to do the actual work, and status color reserved for status.

### Primary

- **Cartographer's Brass** (`brass-300`, oklch(72% 0.12 78)): the Game world's only accent. It marks what is *active, selected, or committed* — the active sidebar item's 2px left bar and its gradient wash, the active tab's underline, the committed chip, the commit button's fill, and every focus ring. `brass-100` is its bright reading (text on dark), `brass-500` its pressed/hover fill, `brass-soft` (14% alpha) its wash, `brass-line` (55% alpha) its hairline, and `brass-focus` (solid) its focus ring. Warm, desaturated, closer to unlacquered instrument hardware than to gold leaf.

  Like `ink-500` and `ink-rule`, **`brass-focus` is pinned to a measured floor rather than to taste.** At solid oklch(72% 0.12 78) it clears the 3:1 non-text floor on every ground: page 7.8, panel 7.5, panel-2 6.9, panel-hover 6.2, panel-active 5.2. It is deliberately *not* an alias of `brass-300` — retuning the accent for a gradient wash must never silently move the focus indicator. Re-measure against all five grounds before changing it.

  It exists because the translucent `brass-line` that previously served as the ring measures 3.21 / 3.21 / 3.13 / **2.98** / **2.73** — it fails on `panel-hover` and `panel-active`, which are the ground under a hovered control and under a *selected row*. A selected row must never be the least legible row, and the focus indicator on it must never be the least visible indicator. `brass-line` remains correct as a hairline and a border; it is simply not a focus ring.
- **Signal Sky** (`classic-primary`, Tailwind `sky-600`): the Classic world's action color. Primary buttons, links, the announcement bar, and the EU4 map sidebar's hover state. Paired with a darker `sky-800` edge on buttons so the control reads as a plate with a rim rather than a floating fill.

### Neutral

- **Cold Slate ladder** (`eu5-page` → `eu5-panel-active`, oklch 15% → 31% at hue 250): the Game world's five-step ground. Page is the darkest; panels sit one step up; raised panels (section headers, chips, count badges, the expand footer) sit one step above that; hover and active are the top two steps. **Depth is this ladder.** Nothing else provides it.
- **Warm Ink ladder** (`eu5-ink-100` → `eu5-ink-disabled`, oklch 94% → 28% at hue 80): the Game world's five-step text scale. `ink-100` is primary values and active labels; `ink-300` is secondary and resting controls; `ink-500` is the workhorse — micro-labels, metadata, ranks, denominators, placeholder text, and bar fills. The warm hue is deliberate: it keeps text from going blue-grey against a blue-grey ground.

  Because `ink-500` carries normal text at 10–12px, it is **pinned to the contrast floor, not to taste**. At oklch 68% it clears 4.5:1 on every ground: page 6.8, panel 6.5, panel-2 6.0, panel-hover 5.4, and panel-active 4.6. Re-measure before moving it.

  `ink-700` and `ink-disabled` are for **genuinely inert marks only** — breadcrumb separators, the `+` between key glyphs, resizer grips. `ink-700` is 2.0:1 and cannot carry text a reader has to resolve; placeholder text, ranks, and entity tags are `ink-500`.

  `ink-rule` (oklch 58%) is the off-ladder step for **hairlines drawn under text**. It clears the 3:1 non-text floor on every ground: page 4.6, panel 4.4, panel-2 4.0, panel-hover 3.6, and panel-active 3.1. It must not carry text.
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

**The Brass Scarcity Rule.** In the Game world, brass appears on at most one element per functional group: one active nav item, one active tab, one commit action. If two things are brass on the same screen, one of them is lying about being active. Focus is exempt: it is transient and there is only ever one focused element, so a focus ring never competes with the one brass thing on screen.

**The One-Focus-Ring Rule.** Focus has exactly one implementation — `components/focusRing.ts` — and it is imported, never retyped. Four variants exist, chosen by *when* the ring should appear, not by what the element is: `focusRing` (keyboard only; the default), `focusRingInset` (same, drawn inside the box, for full-bleed rows where an outside ring would be clipped by the panel edge or painted over the neighbouring row), `focusRingAlways` (any focus, for fields that stay focused), and `focusRingWithin` (composite fields whose ring belongs to the shell). A control too narrow to carry a ring — the 6px panel resize handle — takes `focusBar` and fills solid instead.

Always `outline-hidden`, never `outline-none`. A ring is a box-shadow and box-shadows are not painted under `forced-colors: active`; `outline-hidden` keeps a transparent outline alive there so Windows High Contrast users still get an indicator, while `outline-none` leaves them with nothing. A hand-written focus class is how this decayed into eleven treatments, three of which failed contrast and one of which delegated its colour to whoever styled the consumer.

**The Navigable-Name Rule.** Brass means *selected*, never *clickable*. Navigable country, market, and location names use `ink-100` text with a solid 1px `ink-rule` underline, brightening on hover and focus. Focus also takes the standard `brass-focus` ring.

Underline style carries meaning: solid navigates; dotted with `cursor-help` reveals a tooltip. Keep the shared treatment in `components/EntityName.tsx` so repeated table links stay consistent.

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

**The Named-Handle Rule.** A collapsed panel's handle names what is behind it. EU5 is a map game and the map is the surface the player lands on, so the insight panel starts closed — which makes the handle the only thing telling a first-time reader that data exists. It carries the panel's current title (the active map mode, or the selected entity) in an 11px mono label, and it sits on the floating toolbar's line: a 28px control inside a 40px surface at `top-4`. An unlabelled square asks the reader to click to find out.

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

The form language is **plates, not pills**. The Game world runs three radii and they are all small enough to read as machined edges rather than softness: `plate` (2px) for chips, badges, and inline markers; `control` (3px) for buttons, inputs, and search fields; `panel` (4px) for the outer edge of rails and panels. Progress and bar tracks drop to 1px. The only fully round things in the Game world are 6px status dots, the 2px active-item bar, and the two timeline marks that must read as *instruments* rather than plates: the 11px playhead knob and the 32px play button (§ The Timeline).

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
- **Focus:** 1px solid `brass-focus` ring, no offset — from the shared `focusRing` constant in `components/focusRing.ts`, never hand-written. **Disabled:** 40% opacity.

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

- **Game world:** 28px tall, `page`-colored ground (darker than the panel it sits on — inputs recess, they do not raise), `line` border, `control` radius, 12.5px UI type, `ink-500` placeholder. Focus is a 1px `brass-focus` ring with no offset, and unlike buttons it fires on *any* focus rather than `focus-visible` — a field stays focused while you type and must keep saying so (`focusRingAlways`). On composite variants the ring goes on the wrapper via `focusRingWithin` so the ⌕ glyph and shortcut chip sit inside the focused field, and the bare `<input>` suppresses its own outline.
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

### The Parse Wait (Game world)

Dropping a save is the whole onboarding, so the seconds before the map is a designed surface rather than a gap. It is built to be *still*: a typical EU5 parse is through in one to two seconds and only reaches ten at the high end, so anything that animates in, narrates, or spins is over before it is read.

- **The ground paints first.** `bg-game-page` is on the first frame, before the save has been read (`Eu5Ui.tsx`). The map then arrives into a room that already exists. Nothing in the Game world may paint a Classic ground while waiting.
- **The readout** is a single 520px column, optically centred: filename in 17px Title, percent in 13px mono `ink-300`, the progress track, and one line of `ink-500` caption — *"Parsing locally in your browser."*
- **It describes, it does not reassure.** The caption states what is happening; it never denies what is not. A denial ("nothing is uploaded") raises the question it answers, and this line is read on every load until it is wallpaper — which devalues the claim rather than banking it. The local-parsing claim belongs on the landing page, where it precedes the decision to hand over a file. The same holds for the failure state, where a privacy clause is also the least actionable line on screen. Stage names follow: a GPU texture write is *built*, never *uploaded*.
- **Progress is determinate and honest.** The two workers increment a shared budget that sums to exactly 100 (game 60, map 40). The track is the stat rail's: 4px tall including its hairline, 1px radius, `panel-2` ground, `accent-300` fill. Brass is legal here — during a load it is the only active thing on screen.
- **Stage names are disclosed, not defaulted.** The step now underway appears only after 2.5s. Below that threshold nobody watches seven strings flicker past in a second; above it, a long wait is owed the detail.
- **The dissolve is the one authored moment.** No entrance; on completion the readout fades over the finished app in 220ms.
- **Failure is the same surface.** `Eu5ErrorDisplay` keeps the ground, the measure, and the type, names the problem in the reader's terms, and always offers a recovery plus the two places a human can help.

### The Timeline (Game world)

The campaign's history as a bar along the bottom edge of the map (`features/eu5/timeline/`). It exists only for the political map mode — the one mode with a history — and it **rises from the map edge** when that mode is chosen and **sinks** when another takes over. It is a docked floating surface and ships as the full set: `overlay` ground, `line-strong` edge, `panel` radius, `backdrop-blur-md`, `shadow-xl`, 8px inset from the map edges and the panels that flank it.

- **The readout leads.** The date the map shows, year first in 20px medium mono `ink-100`, month and day in 11px mono `ink-300`, `tabular-nums` so the figures hold still while they tick. In a narrow bar (`@max-xl`) the track drops to a full-width row of its own above the readout and transport.
- **The track is a stacked instrument, 48px tall:** a 16px activity strip of border changes (`accent-500` behind the playhead, `ink-700` ahead of it), an 18px track line with year ticks (`ink-500` where labelled, `ink-700` otherwise) and 9.5px mono year labels, and a 14px label row. The elapsed segment is a 1.5px `accent-500` line; the playhead is a 2px `accent-300` line with an 11px round `accent-300` knob rimmed in `panel` — the one small shadow in the layout, a 1px drop so the knob reads over the strip. Where the map trails the playhead a dashed 50% `accent-300` mark shows how far it has caught up. Named events sit on the line as 10px `ink-300` diamonds that warm to `brass-100` on hover. Brass is legal across the whole track because playback *is* the active thing on screen — the same licence the Parse Wait holds.
- **Transport** is a row of 28px icon buttons around one 32px **round** play button: `panel-raised` ground and `line-strong` edge at rest, warming to a `brass-line` edge on hover; while playing it wears `accent-500` at 20% with a `brass-100` glyph. At the end of a run the glyph *turns in* as a replay offer (360ms), so the change of offer reads as a consequence of arriving. Jump-to-end buttons hide in a narrow bar; Home and End still reach both ends.
- **Motion is one glide.** Playhead and elapsed segment move on `transform` with a shared glide: 220ms settling (`cubic-bezier(0.22, 1, 0.36, 1)`) for a discrete step, 90ms linear between playback frames, 420ms for the rewind sweep before a replay, and none at all while the pointer drags. The bar's own entrance is a 280ms rise with a 12px lift and 3px blur; its exit is a shorter 180ms sink because the mode change already has the user's attention. Arrival at the save date flashes the terminal line brass for 900ms, then settles back to ink.
- **Every animation has a reduced-motion branch that keeps the state.** Under `prefers-reduced-motion` the rise and sink keep a 1ms run so `animationend` still fires and the bar unmounts; the glides drop to none; the arrival keeps its colour change and drops the width swell; the replay glyph fades instead of turning.
- **Overlays share the edge by measurement, not by guess.** The bar publishes its measured height to the store; the selection pill and any other overlay on the bottom edge read it and stand clear, and settle together with it as it leaves.
- **Export rides on the bar.** The timelapse control is the bar's last button; it opens a 288px `panel/95` + `backdrop-blur-xl` + `shadow-2xl` popover that states the film's length and size before a minute of encoding is spent. Once recording, the popover is gone and the button itself carries progress as an 18px ring around the glyph (180ms eased per frame); while the file is assembled and there is no progress to report, the full ring breathes at 1.4s rather than claiming to advance.

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
- **Do** take every focus style from `components/focusRing.ts`, per the One-Focus-Ring Rule.
- **Do** render navigable entity names with `EntityName` (`components/EntityName.tsx`) so the solid ink hairline stays consistent.
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
- **Do** let a row separator that describes the *natural* order — a rank break, a tier boundary — stand down once the reader sorts the table. `rowSeparator` receives `ctx.sorted` for exactly this; a re-sorted table has no such boundary, and leaving the label in place mislabels whatever now sits at that index.
- **Do** give every authored animation a `prefers-reduced-motion` branch that keeps the state change — a 1ms run so `animationend` still fires, a colour change without the swell, a fade instead of a turn — and disable glides outright while a pointer drags.
- **Do** let overlays that share a map edge read each other's measured size from the store (the timeline bar publishes its height) instead of hardcoding an offset.
- **Do** size a sortable column for whichever is wider, its header or its widest value. The sort glyph costs a header roughly 14px, which is enough to truncate one that fit before sorting was enabled.

### Don't:

- **Don't** put a shadow on a game surface that sits in the layout. Depth is the ladder; shadows belong only to surfaces floating over the map, and only alongside a translucent ground and a backdrop-blur.
- **Don't** exceed 4px radius in the Game world, or use `rounded-full` on anything but a status dot, the active-item bar, or the timeline's playhead knob and play button.
- **Don't** hardcode a game's palette into a shared component — read tokens, fall back to Classic values.
- **Don't** let a status color carry brand, category, or emphasis; it means state and nothing else.
- **Don't** paint a link brass; use the Navigable-Name Rule.
- **Don't** hand-write a focus ring, use `brass-line` or any alpha brass as one, or pair `outline-none` with a ring. All three are how the previous eleven treatments happened — see the One-Focus-Ring Rule.
- **Don't** swap underline semantics: solid navigates, dotted reveals help.
- **Don't** set text a reader must resolve in `ink-rule`, `ink-700` or below, or in the chart Plate's `chartInk.muted`. All are non-text inks — use `ink-500` and `chartInk.secondary`, which are the steps measured to clear 4.5:1. `ink-rule` is for the hairline under a name, never the name.
- **Don't** promote `teal-900` to a brand primary. It is the landing page's band color and belongs to that surface.
- **Don't** set an uppercase micro-label above 11px, below 0.14em tracking, or in anything but `ink-500` mono.
- **Don't** use italic outside the landing hero's second line.
- **Don't** spring, bounce, or overshoot. Every Game world glide is on the settling family (`cubic-bezier(0.22, 1, 0.36, 1)` / `(0.16, 1, 0.3, 1)`) or linear between frames; a spring reads as toy, not instrument.
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
