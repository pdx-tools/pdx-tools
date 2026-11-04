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
  eu5-control-line: "oklch(56% 0.012 80)" # the edge of a control; 3.7:1 or more on page, panel, panel-2
  eu5-track: "rgba(255, 255, 255, 0.24)" # the empty part of a bar; about 2.1:1
  eu5-rim: "rgba(255, 255, 255, 0.28)" # the hairline around a game colour; about 2.5:1
  # ── EU5 world: ink ladder (hue 80, warm-neutral) ──
  eu5-ink-100: "oklch(94% 0.018 80)"
  eu5-ink-300: "oklch(81% 0.012 80)"
  eu5-ink-500: "oklch(73% 0.012 80)"
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
  brass-selection: "rgba(212, 160, 90, 0.35)" # ::selection wash; each game theme sets its own at 35% of its accent
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
  chart-div-warm: "#bb5e1f" # = chart-2-sanguine
  chart-div-mid: "#25292e"
  chart-div-cool: "#6a8dce" # = chart-5-indigo
  # ── Chart Plate: in-plot selection (brass; see § Charts) ──
  chart-selection: "#ce9a43"
  # ── Chart Plate: ink and chrome ──
  chart-ink: "#f2eade"
  chart-ink-tick: "#9c9890" # = ink-500
  chart-ink-neutral: "#c5c0b8" # = ink-300, the mark of one series
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
  readout:
    fontFamily: "IBM Plex Mono, ui-monospace, JetBrains Mono, monospace"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0"
    fontFeature: "tabular-nums"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, JetBrains Mono, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0.04em"
  caption:
    fontFamily: "Public Sans, -apple-system, system-ui, Segoe UI, sans-serif"
    fontSize: "12px"
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
  segmented:
    backgroundColor: "{colors.eu5-panel-2}"
    rounded: "{rounded.control}"
    padding: "2px"
    height: "28px"
  segmented-item:
    backgroundColor: "transparent"
    textColor: "{colors.eu5-ink-300}"
    typography: "{typography.ui}"
    rounded: "{rounded.plate}"
    padding: "0 10px"
  segmented-item-on:
    backgroundColor: "{colors.brass-soft}"
    textColor: "{colors.brass-100}"
    typography: "{typography.ui}"
    rounded: "{rounded.plate}"
    padding: "0 10px"
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

Density is a feature here, not a compromise. The audience reads dense strategy-game UI for fun; the comparison point is the game client itself, not a marketing site. So the Game world runs 28–36px rows, 11–13px type, and hairlines at 6% white, and it is _correct_ at that scale. Where other systems would add padding, this one adds information.

The system explicitly rejects three neighbors: **skeuomorphic Paradox chrome** (no faux parchment, no gilded frames, no imitation of the game client's own textures — the tool is adjacent to the game, not cosplaying it), the **generic SaaS dashboard** (no airy card grids, pastel gradients, or marketing-spaced KPI tiles), and the **gamer/RGB aesthetic** (no neon glow, no angular cyberpunk framing, no saturated multi-hue accents in chrome — the Plate's seven pigments are a bounded domain, not a license).

**Key Characteristics:**

- Two sanctioned worlds, split by whether the user is browsing or analyzing, plus the chart Plate inside the Game world
- Brass on slate: exactly one accent hue per world, spent sparingly — brass never enters a plot area except to mark selection
- Chart color is derived and validated against CVD gates, never hand-picked
- Hairline rules and tonal layering carry structure; in the Game world, only surfaces floating over the map are allowed to lift
- Low radii (2–4px in the Game world) — plates, not pills
- Fixed row heights and tabular numerals; columns read as columns
- Uppercase mono micro-labels for section headers, at 11px and quiet
- Precise and unfussy: every control is exactly as large as its job
- Motion settles rather than springs: one ease family, 90–420ms glides, and every authored animation carries a reduced-motion branch that keeps the state change

## Colors

Two palettes, one governing instinct: a single accent hue per world, a long neutral ladder to do the actual work, and status color reserved for status.

### Primary

- **Cartographer's Brass** (`brass-300`, oklch(72% 0.12 78)): the Game world's only accent. It marks what is _active, selected, or committed_ — the chosen variant of a mode, the selection line in the column head, the active tab's underline, the committed chip, the commit button's fill, and every focus ring. `brass-100` is its bright reading (text on dark), `brass-500` its pressed/hover fill, `brass-soft` (14% alpha) its wash, `brass-line` (55% alpha) its hairline, `brass-focus` (solid) its focus ring, and `brass-selection` (35% alpha) the wash behind selected text. Warm, desaturated, closer to unlacquered instrument hardware than to gold leaf.

  Like `ink-500` and `ink-rule`, **`brass-focus` is pinned to a measured floor rather than to taste.** At solid oklch(72% 0.12 78) it clears the 3:1 non-text floor on every ground: page 7.8, panel 7.5, panel-2 6.9, panel-hover 6.2, panel-active 5.2. It is deliberately _not_ an alias of `brass-300` — retuning the accent for a gradient wash must never silently move the focus indicator. Re-measure against all five grounds before changing it.

  It exists because the translucent `brass-line` that previously served as the ring measures 3.21 / 3.21 / 3.13 / **2.98** / **2.73** — it fails on `panel-hover` and `panel-active`, which are the ground under a hovered control and under a _selected row_. A selected row must never be the least legible row, and the focus indicator on it must never be the least visible indicator. `brass-line` remains correct as a hairline and a border; it is simply not a focus ring.

  **Selected text takes the accent.** Brass means _selected_ everywhere in the Game world, so a text selection inside a game surface is brass too: `[data-game-theme] ::selection` paints `--game-accent-selection`, and each game theme sets that variable at 35% of its own accent (EU5 brass, EU4 sky). The browser's default selection colour belongs to no world and must not show inside one. 35% is the working point: deep enough to read as a highlight on the panel ladder, light enough that `ink-100` text stays legible through it.

- **Signal Sky** (`classic-primary`, Tailwind `sky-600`): the Classic world's action color. Primary buttons, links, the announcement bar, and the EU4 map sidebar's hover state. Paired with a darker `sky-800` edge on buttons so the control reads as a plate with a rim rather than a floating fill.

### Neutral

- **Cold Slate ladder** (`eu5-page` → `eu5-panel-active`, oklch 15% → 31% at hue 250): the Game world's five-step ground. Page is the darkest; panels sit one step up; raised panels (section headers, chips, count badges, the expand footer) sit one step above that; hover and active are the top two steps. **Depth is this ladder.** Nothing else provides it.
- **Warm Ink ladder** (`eu5-ink-100` → `eu5-ink-disabled`, oklch 94% → 28% at hue 80): the Game world's five-step text scale. `ink-100` is primary values and active labels; `ink-300` is secondary and resting controls; `ink-500` is the workhorse — micro-labels, metadata, ranks, denominators, placeholder text, and bar fills. The warm hue is deliberate: it keeps text from going blue-grey against a blue-grey ground.

  Because `ink-500` carries small text at 12px, it is **pinned to the contrast floor, not to taste**. At oklch 73% it clears 7:1 on each panel and 5.5:1 on the brass strip: page 8.2, panel 7.9, `panel-2` 7.2, hover 6.5, active 5.5, and the brass strip 6.3. Brightness is a decision for the whole system, not for each surface. Do not lower it. Council round 3, 2026-11-04.

  `ink-700` and `ink-disabled` are for **genuinely inert marks only** — breadcrumb separators, the `+` between key glyphs, resizer grips. `ink-700` is 2.0:1 and cannot carry text a reader has to resolve; placeholder text, ranks, and entity tags are `ink-500`.

  `ink-rule` (oklch 58%) is the off-ladder step for **hairlines drawn under text**. It clears the 3:1 non-text floor on every ground: page 4.6, panel 4.4, panel-2 4.0, panel-hover 3.6, and panel-active 3.1. It must not carry text.

- **Hairlines** (`eu5-line` at 6% white, `eu5-line-strong` at 10%): every internal division in the Game world. `line-strong` is reserved for the outer edge of a panel and the baseline of a tab list; `line` does everything inside.
- **Control edge** (`eu5-control-line`, oklch 52%): the edge of a button, select, field, key hint, and switch. A control must show where it is, so the edge clears the 3:1 non-text floor (WCAG 1.4.11): page 3.6, panel 3.4, panel-2 3.1. On hover it goes to `ink-500`. A hairline divides, and a control edge bounds: do not use one for the other.
- **Track** (`eu5-track`, 18% white): the empty part of a bar. It measures 1.65 to 1.8:1 on each ground, so the reader sees the end of the scale, and it stays quieter than any bar fill.
- **Rim** (`eu5-rim`, 28% white): a 1px hairline around each swatch, flag, chart dot, and bar in a game colour. It measures about 2.5:1 on each ground. The colour itself does not change, so a dark colour (France's navy, Beer) stays visible and stays true.
- **Shell Slate** (`shell-slate`, Tailwind `slate-900`): the app header, navigation menu surfaces, and the dark-mode page ground. The one element common to both worlds.
- **Marketing Teal** (`marketing-teal`, Tailwind `teal-900`): the landing page's alternating band color, and only that. It is a marketing device, not a brand primary.

### Status

- **Good / Warn / Error / Info** (`emerald-500` / `amber-500` / `rose-500` / `sky-400`): shared across both worlds and used only for genuine state. In the Game world these appear as chip text on a neutral `panel-raised` ground — the chip does not take the status color as a fill.

### Charts — the Plate

Charts are the system's **third sanctioned domain**, beside the Classic and Game worlds. The reasoning is one sentence: _data is not chrome._ A chart is the subject, not the instrument around it, so it does not spend the Game world's single accent, and the one-accent rule that governs panels and controls does not govern the plot area. This resolves the question the system carried open: chart color belongs neither to the game's palette nor to a neutral set, but to a domain of its own, scoped like any other under `[data-game-theme]`.

The source is the **engraved atlas plate** — the data-graphic tradition this audience already reads, and the one place in the workbench's own world where many colors legitimately coexist. The pigments are a colorist's box (verdigris, sanguine, smalt, carmine, indigo, terre verte, madder), held deliberately in one tonal register (OKLCH L .59–.67, C .105–.140) so that seven hues read as one hand's washes rather than as seven competing accents. This is a color _logic_, not a texture: no parchment, no plate marks, no antiquing. The full plate lives in `app/components/viz/echartsTheme.ts` and the tokens in `tailwind.css`.

**Every value is derived and validated, never picked.** Against the panel surface charts render on (`--game-panel`, `#0e1217`): worst adjacent CVD ΔE **11.3** (target ≥8, protanopia/deuteranopia at severity 1.0), worst adjacent normal-vision ΔE **17.4** (floor ≥15), first three slots all-pairs **9.3** CVD / **20.0** normal, contrast **4.2–5.9:1** (all ≥3:1). Re-run the check before changing any value.

- **Categorical** — seven slots in fixed order: verdigris `#1a9f99`, sanguine `#bb5e1f`, smalt `#a17fda`, carmine `#b76263`, indigo `#6a8dce`, terre verte `#4c8d57`, madder `#c178a9`. The order _is_ the safety mechanism; assign in sequence, never cycle. Past seven, fold the tail into "Other" or facet — a generated eighth hue would not clear the gates. Forms where any two marks can touch (scatter, heatmap, small multiples) are capped at the **first three slots**, the ones validated all-pairs.
- **Sequential** — magnitude, one hue (slot-1 verdigris), `#002b29` → `#3ed0c8`. The dark ground inverts the anchor: near-zero recedes toward the panel, magnitude climbs toward light.
- **Ordinal** — ordered tiers and buckets, same hue, five steps `#005a56` → `#35c9c2`. Monotone L, adjacent ΔL ≥ 0.06, dark end 2.32:1 on surface.
- **Diverging** — polarity only, and **its poles are Plate slots, not new colors**: sanguine `#bb5e1f` (slot 2, warm) ↔ neutral `#25292e` ↔ indigo `#6a8dce` (slot 5, cool), both used unchanged. Drawing the poles from the box is what stops a polarity chart from looking like it belongs to a different palette than the categorical charts beside it; the interior steps only walk each pole down to a midpoint that sits just above the panel, so "no difference" reads as nothing rather than as a value.
- **Ink and chrome** — all chart text is 12px in `ink-500` (`chartInk.tick`, 7.9:1 on the surface). Numbers and tags are in the mono, which is tabular, and names are in the sans, the same split as a list. The EU5 surface gives this to a value axis through `--game-chart-num-font`, with the compact tick form (`formatTick`: 0.5, 20, 5K, 10M). Other surfaces do not set the token, so EU4's charts do not change. Grid and axes are at the same 6%/10% hairlines used everywhere else.
- **Stacked charts** — the charts of a level share their plot edges (`chartGutter`: 72px and 24px). A y axis has its name flat, above the axis (`yAxisName`), and an x axis has its name centred under it. A histogram has `histogramBar`, one step under a line, and its median and p90 are brass dashed lines of 2px with their values on the chart labels, not in the heading. A line of 1px loses its colour in an image with subsampled colour, such as a shared screenshot. The heading is one line and also names the counts, in place of a y axis name ("Development · locations per band", "Control (%) · locations per band"). The median's label ends on its line and the p90's label starts on its line, so they stay on one row. They have two rows only when they would overlap (`histogramLabels`). A concentration curve has no area fill and has a point at the value that its sentence quotes. A level whose finding quotes that value has no sentence over the curve, and the point stays. A scatter says "Labelled: You, selection and top 5 by total", and the player's dot has a You mark.
- **One series, neutral** — a chart of one magnitude (a histogram, a concentration curve, a history line) uses `neutralMark`, which is `ink-300`, the colour of a list's bar. It identifies nothing on the map (the Single-Series Colour Rule). A highlighted mark is brass.
- **Scatter of countries** — the x axis is log, because one or two giants otherwise push all other countries into one column. A log axis has no zero. A value at zero or under is plotted on the left edge, one decade under the smallest real value. The edge's tick says "0" (or "≤0"), a note under the chart gives the count, and the tooltip keeps the real value. No dot is dropped. Dots keep their game colour at 70% opacity with the rim. Only the five largest and the selected countries have a label, in the mono, with the name in place of a generated tag, and overlapping labels hide. There is no slider: the log axis does the slider's work, and wheel zoom stays.
- **Histogram** — numbers stand on the edges between bins, horizontal, on round values only (`histogramXAxes`). A label on a bar's centre says that the bar is at that number. The section label names the counts, so that the band over the plot is free for median and p90. An empty bin stays, because a gap is a fact.
- **Years** — a time axis has its ticks on round years (1350, 1400), not on steps from its ends (1337, 1382). The tooltip gives the exact year.

**Game colour is exempt, and outranks all of the above.** The Plate governs colour the product _invents_. Colour the product _reports_ — anything EU5 itself uses — is domain truth and is not subject to the Plate's register, gates, or ramps. This covers the per-entity `colorHex` arriving on countries, religions, goods, and markets from the save, and the values transcribed by hand in `app/features/eu5/gameColors.ts` (settlement ranks, building ownership). A player who has been reading the game client should recognise a rural band or a foreign-owned building instantly; that recognition beats palette coherence every time. An ordered set of game colours stays game-coloured — it does **not** become an ordinal ramp.

There is **no light selection**, by design. `[data-game-theme="eu5"]` carries no `prefers-color-scheme` guard, so the surface is unconditionally dark; a second selection could only drift out of sync with it. (It previously did: charts read the OS preference and served every light-mode user a light palette on a near-black panel.)

### Named Rules

**The Brass Scarcity Rule.** In the Game world, brass appears on at most one element per functional group: one active nav item, one active tab, one commit action. If two things are brass on the same screen, one of them is lying about being active. Focus is exempt: it is transient and there is only ever one focused element, so a focus ring never competes with the one brass thing on screen.

**The One-Focus-Ring Rule.** Focus has exactly one implementation — `components/focusRing.ts` — and it is imported, never retyped. Four variants exist, chosen by _when_ the ring should appear, not by what the element is: `focusRing` (keyboard only; the default), `focusRingInset` (same, drawn inside the box, for full-bleed rows where an outside ring would be clipped by the panel edge or painted over the neighbouring row), `focusRingAlways` (any focus, for fields that stay focused), and `focusRingWithin` (composite fields whose ring belongs to the shell). A control too narrow to carry a ring — the 6px panel resize handle — takes `focusBar` and fills solid instead.

Always `outline-hidden`, never `outline-none`. A ring is a box-shadow and box-shadows are not painted under `forced-colors: active`; `outline-hidden` keeps a transparent outline alive there so Windows High Contrast users still get an indicator, while `outline-none` leaves them with nothing. A hand-written focus class is how this decayed into eleven treatments, three of which failed contrast and one of which delegated its colour to whoever styled the consumer.

**The Navigable-Name Rule.** Brass means _selected_, never _clickable_. Navigable country, market, and location names use `ink-100` text with a solid 1px `ink-rule` underline, brightening on hover and focus. Focus also takes the standard `brass-focus` ring. In a dense table (any `<table>`), each row has such names, and 26 underlines on one screen read as noise (Tufte: smallest effective difference). There the underline shows only on the row's hover and gets bright on the link's hover or focus.

The column has three forms for "this goes somewhere", and only three. A **tab** opens a first level of the selection, and a **chevron** opens a level under it (the rows of a profile). A **solid underline** is a jump to another entity. A small **"?" mark**, on `cursor-help` text that keeps its colour, is a glossary term that reveals a tooltip (`glossaryTerm`). An underline means a link and nothing else. No other arrow glyph is a link. Keep the shared treatment in `components/EntityName.tsx` so repeated table links stay consistent.

**The Chevron Rule.** A chevron means "opens a level", and nothing else. A list row selects what it names, so it has no chevron. It has a hover, and a quiet **+** at its end when it can join the selection. A row that does nothing has no chevron and no hover. A row that expands in place has a down caret that turns when open, and a hover (the Goods level's rows).

**The Ink-500 Rule.** Anything that labels, annotates, or qualifies is `ink-500`. Anything that _is_ the answer is `ink-100`. There is no third option — a value is either the data or the frame around it.

**The Status-Is-State Rule.** The four status colors never carry brand, emphasis, or category. A green number means good; it does not mean "positive category." Category color comes from the map's own legend or the chart Plate, never from this palette.

**The Game-Colour Rule.** Colour that EU5 itself assigns is domain truth and outranks the Plate: entity `colorHex` from the save, and the hand-transcribed constants in `gameColors.ts`. Recolouring it to fit the system is a regression even when the result is more coherent, because the tool is read next to the game client and recognition is the point. When a game colour and a Plate colour must sit in one chart, the game colour wins and the Plate colour moves.

**The Reserved Yellow Rule.** Brass owns the yellow region (hue ~60–110) outright, and no chart pigment may enter it. This is measured, not stylistic: no yellow inside the dark band clears brass by the ΔE 15 "never collides at a glance" bar — the closest possible gamboge reaches 13.9 — so the Plate carries **seven** pigments rather than the usual eight. A yellow series would be a series impersonating the selection state.

**The Brass-Is-Selection Rule.** The single exception to "brass never enters the plot area" is _selection itself_: a selected mark wears brass, because brass means selected everywhere else in the shell. This is safe by construction rather than by convention — every pigment was required to clear brass by ΔE ≥ 15, so a brass mark can never be mistaken for a series. The in-plot value is `chart-selection` (`selectionColor` in `echartsTheme.ts`) — brass read as hex for the chart layer, not a second accent.

**The Single-Series Colour Rule.** One rule for a bar in a list: it is neutral (`ink-300`) whenever its row has a swatch or an icon, because the swatch already carries the identity and keeps the game colour. That covers Religion, Political subjects, Markets, and the great powers. The signal pair (the diverging poles) is used only for sign. A chart series with no swatch keeps the rule in § Charts. A scatter of countries is one muted neutral at 40%, and only the player, the selection, and the labelled largest countries have the game colour with a light ring, drawn last (Tufte: layering; Few: colour to highlight). A colour that identifies nothing is decoration.

**The Encoding-Picks-the-Ramp Rule.** The data's job picks the ramp, not the chart's convenience. Identity takes categorical slots; an ordered sequence (tiers, bands, buckets) takes the ordinal ramp so the order is visible in the color; magnitude takes sequential; and anything with two sides of a baseline — surplus/shortage, over/under, positive/negative — takes the diverging poles, never two categorical slots. If swapping two series would change the meaning, it is not categorical. **This rule stops at game colour** — an ordered set the game already colours keeps those colours, per the Game-Colour Rule.

## Typography

**Display / Body Font (Classic world):** the platform sans stack (`ui-sans-serif, system-ui, sans-serif`) — no webfont is loaded on the public web surfaces.
**UI Font (Game world):** Public Sans (with `-apple-system, system-ui, "Segoe UI"` fallback), loaded via Fontsource inside the game shell only.
**Numeric / Label Font:** IBM Plex Mono (with `ui-monospace, "JetBrains Mono"` fallback).

**Character:** Public Sans is a neutral, high-legibility grotesque that survives being set at 12.5px on a dark ground — it has no personality to lose at small sizes, which is exactly the point. IBM Plex Mono carries every number, rank, and section label; its tabular figures are load-bearing, not stylistic. The pairing reads as instrumentation: the sans says what a thing is, the mono says how much of it there is.

### Hierarchy

- **Display** (800, 2.25rem → 3.75rem across `lg`/`xl`, tight leading, `-0.025em`): the landing hero only. Set with `text-balance`, and the second line runs italic as the single expressive typographic gesture in the entire system.
- **Headline** (800, 1.875rem → 2.25rem, `-0.025em`): landing section headers.
- **Title** (500, 17px, 1.25 leading): the Game world's panel identity — the mode heading, a level's title, and the filename on the parse wait. The largest _sans_ the Game world sets; only a Readout goes larger. The save name in the column head is 14px, not 17px: it is the object of the save actions and not the heading of the level, so the mode heading stays the largest text in the column, and the name gets more room on its own line.
- **Readout** (500, 17–20px, mono, `tabular-nums`, leading-none): a live figure read at a glance from across the map — the timeline's 20px year, the 17px figure on an economy stat plate. Always a number, always mono, never a title: words at this size would compete with the map.
- **Body** (400, 1rem–1.25rem, 1.6 leading): landing and docs prose, capped at `max-w-prose`.
- **UI** (400/500, 12.5px, leading-none): every Game world control, tab, nav item, and button. 12px for stat rail labels. 14px for the save name, the name on the selected block, and a selected location's answer.
- **Numeric** (400, 12–13px, `tabular-nums`): all values, counts, ranks, dates, shortcuts, in the steps 12 and 13. 13px is only for a headline figure and for the save's year. A selected location's value on the legend is 14px. A rank is `#293` at 11px on the baseline, right-aligned and tabular: there are no superscript ordinals, because a raised suffix is the least legible thing in a column of ranks and carries no information there.
- **Label** (500, 11px, uppercase, `0.04em` tracking, one string: `sectionLabel`): section bands, table heads, rail headers, the `SectionTitle` above every chart, menu groups, and search groups. Always `ink-500`. Size and tracking come from `--game-label-size` and `--game-label-tracking`, so that EU4 keeps its own.
- **Caption** (400, 12px, 1.4 leading): the sans counterpart to Label — descriptive text under a control, roadmap copy, and chip labels. The one place this size is set in the UI sans rather than the mono.

**The Type Floor.** Small data text in the column is 12px: tags, ranks, unit labels, captions, and axis ticks. Only uppercase section labels stay at 11px, with tracking of 0.04em or less. An explanatory sentence is in the sans (WCAG 1.4.4 in spirit; Refactoring UI: do not shrink what must still be read). Council round 3, 2026-11-04.

**The EU5 steps.** EU5 sets 11 (uppercase labels only), 12, 12.5, 13 (Numeric only), 14, 16 (a level's finding), 17, and 20px. It has no half-pixel step apart from 12.5. The shared campaign and timeline parts (`features/campaign`, `features/timeline`) are outside this collapse, because other games use them. Chart text is 11px, with axis names in weight 400 and tick ink: a chart has no title style of its own, because its `SectionTitle` names it.

### Named Rules

**The Tabular Rule.** Any number a user might compare against another number is set in IBM Plex Mono with `tabular-nums`. This includes ranks, dates, counts, and denominators — not just table columns.

**The Whisper-Label Rule.** Uppercase micro-labels are always the quietest thing on screen: `ink-500`, mono, 11px, tracked at 0.04em. Position and colour keep them quiet, not size. A micro-label that competes with its own content is set wrong.

**The One-Formatter Rule.** A number has one form for its kind, in every view (`lib/format.ts`). The rule lets the eye scan a column and stops France's development being 14.3K in one place and 14,253 in another.

- `formatMetric`, amounts in a list, table, stat line, or readout: one decimal and a unit (72.2, 958.0, 9.1K, 14.3K, 22.9M), so that the decimal column lines up in each list and in Compare. A value that rounds to zero and is not zero reads `<0.1`.
- `formatPercent`, a share or ratio: one decimal, with `<0.1%` as the floor, in each list and chart, also Pop Types. `formatRate`, a yearly rate: two decimals and a sign (+0.79%), because its values are small.
- `formatCount`, things that are whole: an integer under 1,000, then the same compact form (958, 22.9K).
- `formatLevel`, a level that can be whole or a mean: 17, 16.5.
- `formatPercent`, a ratio: 95.3%, 100%.
- `formatScale`, a fixed scale such as stability: one decimal, so each row of Compare has one rule (96.3, 11.3, −5.1).
- `formatFixed` and `formatFixedPercent`, one column of a sortable table: one number of decimals for the column, so that place values align (Dev 90.9, Wealth 225, shares 79.1%). A share that is small and not zero reads "<0.1%", never "0%". A narrow list keeps the compact three figures of `formatMetric`.
- A chart's tooltip keeps the exact value, because it is where the reader asks for it.

**The One-Term Rule.** One label for each metric, in bands, stat lines, table heads, and Compare rows. A heading or the mode menu may use the full name, because there it names the mode and is not a label on a figure. **A sum has its own label:** a list of countries says "Total Dev", "Total Eff. Dev", "Total Wealth", "Total Tax Gap", or "Total Pop", and a list of a location's own values says "Dev", "Eff. Dev", and so on, because the legend above a list colours per location and the two units must not read as one (Few: label scales with their unit). The legend says so too: "Map: dev per location". A term that this tool defines has a thin dotted underline and a tooltip wherever it labels a figure (`DefinedTerm`).

| Metric | Label | Full name (headings, tooltips, mode menu) |
| --- | --- | --- |
| Development | Dev | Development |
| Effective development | Eff. Dev | Effective Development |
| Population | Pop | Population |
| Location count | Loc. | Locations (also a row's noun) |
| Control | Control | Control |
| Wealth | Wealth | Wealth |
| Tax base | Tax Base | Tax Base |
| Tax base gap | Tax Gap | Tax Base Gap |
| RGO level | RGO Level | RGO Level |
| Building levels | Levels | Building Levels |
| Followers | Followers | Followers |

A country's sum and a location's value have one label: the row's noun says which it is. The word "Total" and "Avg." do not go on a label.

**The One Italic Rule.** Italic appears exactly once in the system — the landing hero's second line. It is not available as general emphasis.

## Layout

**Classic world.** A centered `max-w-7xl` (1280px) column inside a 64px-tall `slate-900` header bar, with page padding of 20px rising to 36px at `md`. The landing page is a stack of full-bleed alternating bands (explicit `tealBand` / `whiteBand` classes in `Home.tsx`, never `odd:`/`even:`, so a row can be inserted without recolouring the ones below it) at 64px vertical rhythm, whose paired content sections alternate reading direction at `lg` (`lg:flex-row-reverse` via the `reverse` row class) so the eye zig-zags down the page. Bands are separated by a full-width SVG "lip" — a shallow 58px-tall curve that lets the teal rise into the white rather than butting against it. Feature grids run 1 → 2 → 4 columns across `sm`/`xl`. Breakpoints are Tailwind stock: 640 / 768 / 1024 / 1280 / 1536.

A strip that must bleed to the viewport edge (the landing creator reel) lives in a band with no horizontal padding and pads itself by `max(page padding, (100vw − 80rem) / 2)` so its first item sits on the `max-w-7xl` axis. A snap-scrolling strip repeats that same value as `scroll-padding`, or the snap positions rest off the axis. The strip's own heading and any content after it stay in the ordinary centred column.

**Game world.** One column on the left over a full-bleed map canvas (§ The Column), with floating overlays (the timeline, the cursor tooltip, menus) positioned against the column's measured inset rather than a document flow. Vertical rhythm is a **row-height system, not a spacing scale**: 28px for controls, nav items, buttons, and inputs; 30px for stat rail rows; 32px for tabs and crumbs; 36px for status lines. On a phone a target has more: 44px for each target: a list row, a table row, a menu item, a crumb, each icon, and each side of a chip. A control that is smaller on the screen (a 36px field, a 38px segment) has a target of 44px through a pseudo-element, so that its row stays short (§ The phone sheet). Horizontal inset is 14px (`px-3.5`) at the panel edge and 12px (`px-3`) inside rails. Panels are `overflow-hidden` with their own internal scroll.

The Game world responds to **container width, not viewport width**. The stat rail is one column by default and reflows to 2 columns at a 720px container and 3 at 1040px, with section headers spanning full width and ragged tails left empty. Column rules are drawn by a `game-line`-colored grid background showing through a 1px gap — so an orphan cell reads as an empty cell, not a broken grid.

### Named Rules

**The Row-Height Rule.** In the Game world, controls get a fixed height from the row scale (28 / 30 / 32 / 36), never vertical padding. Two adjacent controls of the same kind are always the same height, and a row of mixed controls always aligns on a single baseline.

**The Container-Query Rule.** Game world panels are movable and resizable, so their internal layout keys off `@container`, never a media query. A panel dragged narrow must reflow on its own.

**The Named-Row Rule.** A row that opens a level names what is behind it. EU5 is a map game and the map is the surface the player lands on, so the column rests on the mode's key and the insight is one row below it — which makes that row the only thing telling a first-time reader that data exists. It carries the insight's title and its scope ("The whole world · 646 countries"). A chevron without a name asks the reader to click to find out.

## Elevation & Depth

The two worlds have **deliberately different elevation vocabularies**, and this is sanctioned rather than tolerated: each game surface is empowered to run the depth model that suits it.

**Game world: two tiers, and only one of them is allowed to lift.** Surfaces _in the layout_ — rails, rows, chips, buttons, tabs, section headers — are strictly flat. Their depth comes entirely from the five-step panel lightness ladder plus hairline borders: a panel is "above" the page because it is lighter, and it is bounded because it has a 10%-white edge. Hover is a step up the ladder (`panel` → `panel-hover`), not a lift.

Surfaces _floating over the map_ — the toolbar, cursor tooltip, selection pill, shortcut panel, timeline, and select menus — are a separate tier and they lift. Each combines three things together, never one without the others: a translucent ground (`eu5-overlay` at `rgba(8,11,16,0.72)`, or `panel/95`), a `backdrop-blur`, and a shadow sized to the surface (`shadow-lg` for small transients, `shadow-xl` for the docked timeline, `shadow-2xl` for menus and modals). The blur is what makes the shadow legible against a moving map; a shadow without it reads as dirt on the canvas.

The **column** is neither. It runs edge to edge from the top of the viewport to the bottom and the map ends where it begins, so it is a _wall_, not an object on the map. It takes the in-layout treatment: a `panel` ground and a `line-strong` edge on the side that meets the map, no shadow. A flag, swatch, or plate inside it is flat for the same reason. The one exception is an **expanded** level: the column then takes the frame and the map becomes a 340 × 200 inset over it, which is an object on the level and takes `line-strong` and `shadow-2xl`. It has no translucent ground because it is the map itself. The inset sits in the bottom-right corner. The level has space at its end, so the last content scrolls clear of the inset.

**Classic world: shadows are the vocabulary.** Cards rest at `shadow-md`, floating surfaces (dialogs, popovers, dropdowns, sheets) use `shadow-lg`/`shadow-xl`. This is the incumbent convention and it stays.

### Shadow Vocabulary (Classic world only)

- **Resting** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): cards and panels at rest.
- **Floating** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): dropdowns, popovers, tooltips.
- **Lifted** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): dialogs and sheets over a dimmed page.

### Named Rules

**The Sovereign Game Rule.** Each game's surface owns its own design system, scoped under `[data-game-theme]`. EU5's tokens are not a global default and EU4 is free to establish its own. Shared primitives (Tooltip, Dialog, Table) must read from tokens where a game theme provides them and fall back to Classic values otherwise — never hardcode a game's palette into a shared component.

**The Flat-Until-Floating Rule (Game world).** A shadow on a surface that sits _in_ the layout is a bug — move it up the panel ladder and give it a `line-strong` edge instead. A shadow is earned only by leaving the layout to float over the map, and then it arrives as a set: translucent ground + `backdrop-blur` + shadow. Never a shadow on its own.

## Shapes

The form language is **plates, not pills**. The Game world runs three radii and they are all small enough to read as machined edges rather than softness: `plate` (2px) for chips, badges, and inline markers; `control` (3px) for buttons, inputs, and search fields; `panel` (4px) for the outer edge of rails and panels. Progress and bar tracks drop to 1px. The only fully round things in the Game world are 6px status dots, the 2px active-item bar, and the two timeline marks that must read as _instruments_ rather than plates: the 11px playhead knob and the 32px play button (§ The Timeline).

The Classic world is softer by a full step: `rounded-md` (6px) for buttons and inputs, `rounded-lg` (8px) for cards, `rounded-xl` (12px) for feature tiles, `rounded-full` for badges and avatar buttons.

Borders are 1px and solid everywhere; the difference between the worlds is opacity, not weight. The Game world's borders are white at 6–10%; the Classic world's are `gray-400` at 50–100%. The landing page's feature tiles invert this with a 4px solid white border on teal — the one place a border is a graphic element rather than a division.

### Named Rules

**The Small-Radius Rule.** No Game world element exceeds 4px radius. If a design calls for a soft, rounded container in a game surface, the design is wrong for the room.

## Components

Everything below is **precise and unfussy**: fixed heights, hairline borders, no ornament. A control does exactly one thing and takes exactly the room it needs.

### Buttons

**Game world** (`GameButton`) — four variants, all 28px tall, 12px horizontal, `control` radius, 12.5px UI type, 1.5 gap between icon and label:

- **Commit:** `brass-300` fill with a `brass-500` edge and `panel`-colored text (dark text on brass — the only inverted control in the system). Hover deepens to `brass-500`. Reserved for the action that changes state.
- **Default:** `panel` fill, `control-line` edge, `ink-100` text. Hover steps the fill to `panel-hover` _and_ the border to `ink-500` — both move together.
- **Ghost:** transparent, `ink-300` text, gaining a `panel-hover` ground on hover.
- **Icon:** 28×28 square, `ink-500` at rest, `ink-100` on hover.
- **Focus:** 1px solid `brass-focus` ring, no offset — from the shared `focusRing` constant in `components/focusRing.ts`, never hand-written. **Disabled:** 40% opacity.

**Classic world** (`Button`) — `rounded-md`, 16px × 8px padding, medium weight, 1px solid border on every variant:

- **Primary:** `sky-600` fill, `sky-800` border, white text; hover `sky-500`, active `sky-400`.
- **Default:** white (dark: `slate-700`) fill, `gray-400` border, 80%-black text.
- **Danger:** white fill, `rose-400` border, `rose-800` text — outlined, never filled red.
- **Focus:** 2px ring with a 2px offset against `slate-300/70`. **Disabled:** 50% opacity, `not-allowed` cursor.
- Shapes are orthogonal to variants: `default` (rounded-md, 16×8), `square` (rounded-md, 8), `circle` (rounded-full, 8), `none`.

**Segmented** (`GameSegmented`) — a single-choice switch between a few named views of the same data ("Value" / "Units"). A switch alone on a row takes the row's width, with equal segments; a switch beside other content has the width of its labels. The frame is a quiet ground with no edge, so that the switch is not the loudest object in its column: 28px, `panel-2` ground, `control` radius, 2px inset. Each option is a chip inside it — `plate` radius, 12.5px UI type, 10px horizontal — and exactly one is on: the on option is the committed chip (`brass-soft` ground, `brass-line` edge, `brass-100` medium text); the rest are `ink-300` ghosts that step to `panel-hover` and `ink-100` on hover. Arrow keys move between options and the ring is the shared `focusRing`. It replaces the Classic `ToggleGroup`, whose sky selection has no standing in the Game world.

### Chips

- **Style:** `plate` radius (2px), `panel-raised` ground, `line` border, 11px UI type, 8px × 2px padding, optional 6px leading dot.
- **Variants:** `default` (`ink-300`), `committed` (`brass-soft` ground, `brass-line` border, `brass-100` text, brass dot), and `good`/`warn`/`error` which recolor only the _text and dot_ — the ground stays neutral.
- Also serves as the keyboard-shortcut badge inside search fields, set in 10px mono.

### Cards / Containers

- **Game world panels:** `panel` radius (4px), `line-strong` outer border, `panel` ground, `overflow-hidden`, no shadow. A header row divided by a `line` border with an uppercase mono title left and dimmed metadata right.
- **Classic cards:** `rounded-lg`, `gray-400/50` border, `slate-50` (dark: `slate-800`) ground, `shadow-md` at rest.

### Inputs / Fields

- **Game world:** 28px tall, `page`-colored ground (darker than the panel it sits on — inputs recess, they do not raise), `control-line` border, `control` radius, 12.5px UI type, `ink-500` placeholder. Focus is a 1px `brass-focus` ring with no offset, and unlike buttons it fires on _any_ focus rather than `focus-visible` — a field stays focused while you type and must keep saying so (`focusRingAlways`). On composite variants the ring goes on the wrapper via `focusRingWithin` so the ⌕ glyph and shortcut chip sit inside the focused field, and the bare `<input>` suppresses its own outline.
- **Classic:** `rounded-md`, `gray-400` border (dark: `gray-600`), white (dark: `slate-700`) ground, `text-sm`, 2px focus ring with 2px offset.

### Navigation

- **Game world column rows** (`stack/parts.tsx` `Row`): at least 30px, 14px inset, 12.5px UI type in `ink-100`, mono `tabular-nums` value and dimmed figure on the right, and a chevron when the row opens a level. Hover steps the ground to `panel-hover`; a row whose land the map lights holds that ground. The open mode is named by the mode menu, not by a brass row.
- **Game world tabs:** 32px triggers, 12px inset, `ink-500` → `ink-300` on hover → `ink-100` active, with a 2px `brass-300` underline drawn as an `::after` pinned to the bottom edge of a `line-strong` baseline. Counts ride in a `plate`-radius `panel-raised` badge.
- **Classic header:** 64px `slate-900` bar, 48px app mark plus wordmark (wordmark hidden below `sm`), Radix navigation menus opening onto `slate-900` panels. Social icons sit at 75% opacity and resolve to full on hover and focus.

### Stat Rail (signature component)

The system's clearest expression of the workbench. A rail of metrics on a strict 5-column grid — `16px` icon slot, `1fr` label, `60px` bar, `76px` value, `64px` rank — at 30px per row with `line` dividers and a `panel-hover` row hover.

- The **bar track** is painted only for bounded ratios in [0,1]; raw counts leave the track empty rather than inventing a scale. Track: 4px tall, 1px radius, `track` ground, `ink-300` fill, at least 2px for a value that is not zero.
- The **value** is right-aligned 12px mono tabular, with an optional dimmed denominator (`88 / 112`) where the `/ 112` is `ink-500`.
- The **rank** is `#293`, 12px mono on the baseline; the cohort size is stated once on the first band, never per row.
- **Section headers** span all columns on a `panel-raised` ground with top and bottom `line` borders, in `sectionLabel`.
- An optional footer button (`panel-raised`, 12px UI type, chevron-down) expands the rail.

### The Parse Wait (Game world)

Dropping a save is the whole onboarding, so the seconds before the map is a designed surface rather than a gap. It is built to be _still_: a typical EU5 parse is through in one to two seconds and only reaches ten at the high end, so anything that animates in, narrates, or spins is over before it is read.

- **The ground paints first.** `bg-game-page` is on the first frame, before the save has been read (`Eu5Ui.tsx`). The map then arrives into a room that already exists. Nothing in the Game world may paint a Classic ground while waiting.
- **The readout** is a single 520px column, optically centred: filename in 17px Title, percent in 13px mono `ink-300`, the progress track, and one line of `ink-500` caption — _"Parsing locally in your browser."_
- **It describes, it does not reassure.** The caption states what is happening; it never denies what is not. A denial ("nothing is uploaded") raises the question it answers, and this line is read on every load until it is wallpaper — which devalues the claim rather than banking it. The local-parsing claim belongs on the landing page, where it precedes the decision to hand over a file. The same holds for the failure state, where a privacy clause is also the least actionable line on screen. Stage names follow: a GPU texture write is _built_, never _uploaded_.
- **Progress is determinate and honest.** The two workers increment a shared budget that sums to exactly 100 (game 60, map 40). The track is the stat rail's: 4px tall including its hairline, 1px radius, `panel-2` ground, `accent-300` fill. Brass is legal here — during a load it is the only active thing on screen.
- **Stage names are disclosed, not defaulted.** The step now underway appears only after 2.5s. Below that threshold nobody watches seven strings flicker past in a second; above it, a long wait is owed the detail.
- **The dissolve is the one authored moment.** No entrance; on completion the readout fades over the finished app in 220ms.
- **Failure is the same surface.** `Eu5ErrorDisplay` keeps the ground, the measure, and the type, names the problem in the reader's terms, and always offers a recovery plus the two places a human can help.

### The Timeline (Game world)

The campaign's history as a bar along the bottom edge of the map (`features/eu5/timeline/`). It exists only for the political map mode — the one mode with a history — and it **rises from the map edge** when that mode is chosen and **sinks** when another takes over. It is a docked floating surface and ships as the full set: `overlay` ground, `line-strong` edge, `panel` radius, `backdrop-blur-md`, `shadow-xl`, 8px inset from the map edges and the panels that flank it.

- **The readout leads.** The date the map shows, year first in 20px medium mono `ink-100`, month and day in 11px mono `ink-300`, `tabular-nums` so the figures hold still while they tick. In a narrow bar (`@max-xl`) the track drops to a full-width row of its own above the readout and transport.
- **The track is a stacked instrument, 48px tall:** a 16px activity strip of border changes (`accent-500` behind the playhead, `ink-700` ahead of it), an 18px track line with year ticks (`ink-500` where labelled, `ink-700` otherwise) and 9.5px mono year labels, and a 14px label row. The elapsed segment is a 1.5px `accent-500` line; the playhead is a 2px `accent-300` line with an 11px round `accent-300` knob rimmed in `panel` — the one small shadow in the layout, a 1px drop so the knob reads over the strip. Where the map trails the playhead a dashed 50% `accent-300` mark shows how far it has caught up. Named events sit on the line as 10px `ink-300` diamonds that warm to `brass-100` on hover. Brass is legal across the whole track because playback _is_ the active thing on screen — the same licence the Parse Wait holds.
- **Transport** is a row of 28px icon buttons around one 32px **round** play button: `panel-raised` ground and `line-strong` edge at rest, warming to a `brass-line` edge on hover; while playing it wears `accent-500` at 20% with a `brass-100` glyph. At the end of a run the glyph _turns in_ as a replay offer (360ms), so the change of offer reads as a consequence of arriving. Jump-to-end buttons hide in a narrow bar; Home and End still reach both ends.
- **Motion is one glide.** Playhead and elapsed segment move on `transform` with a shared glide: 220ms settling (`cubic-bezier(0.22, 1, 0.36, 1)`) for a discrete step, 90ms linear between playback frames, 420ms for the rewind sweep before a replay, and none at all while the pointer drags. The bar's own entrance is a 280ms rise with a 12px lift and 3px blur; its exit is a shorter 180ms sink because the mode change already has the user's attention. Arrival at the save date flashes the terminal line brass for 900ms, then settles back to ink.
- **Every animation has a reduced-motion branch that keeps the state.** Under `prefers-reduced-motion` the rise and sink keep a 1ms run so `animationend` still fires and the bar unmounts; the glides drop to none; the arrival keeps its colour change and drops the width swell; the replay glyph fades instead of turning.
- **Overlays share the edge by measurement, not by guess.** The bar publishes its measured height to the store; the selection pill and any other overlay on the bottom edge read it and stand clear, and settle together with it as it leaves.
- **Export rides on the bar.** The timelapse control is the bar's last button; it opens a 288px `panel/95` + `backdrop-blur-xl` + `shadow-2xl` popover that states the film's length and size before a minute of encoding is spent. Once recording, the popover is gone and the button itself carries progress as an 18px ring around the glyph (180ms eased per frame); while the file is assembled and there is no progress to report, the full ring breathes at 1.4s rather than claiming to advance.

### The Campaign View (Game world)

The saves of one campaign, compared (`features/eu5/compare/`). It is a view on the political map, not a map mode of its own: the control panel lists it under **Campaign** beside the map modes, and the toolbar names it ("Campaign · 4 saves") once the session knows of a second save, so the reader never has to look for it. Choosing a map mode ends it.

- **World first, country second.** The panel opens on the whole map: a readout line of counts, the land that changed hands (old owner → new owner, locations, population), and the countries that changed most, players first. A country row opens the country ledger; "The whole world" returns.
- **The map is the second half of the panel.** It dims every location that did not change owner, and shows owners on the comparison's end date. A transfer row in brass marks only its land. When the end is later than the open save's history, a note says which date the map shows and offers to open the later save.
- **The strip is the spine.** The snapshot strip and its brass endpoints head every state; other saves and uploads of the campaign sit in a disclosure under it, open only while there is nothing to compare yet.
- **Identity is the tag.** Snapshots are aligned to the open save's country ids by tag, so a civil war that moves a tag to a new id does not read as a conquest.

### The Column (Game world)

One column beside the map that goes deeper, never wider than its level asks (`features/eu5/stack/`). It replaced the control panel and the insight panel, which framed the map from two walls and put the mode on one wall and its explanation on the other. The part names follow `features/stack` on the HOI4 branch, so that the two shells can become one by a rename.

- **The map bar, on the map.** Home, the save name and date; Frame the selection (only with a selection), Screenshot; Share, the **⋯ menu**, and help (`stack/MapBar.tsx`). These act on the save and the whole frame and not on the analysis, so they are not in the column, and they keep one place when a level widens the column. The name has the width that it needs, and a long name wraps. **Melt** is the first item of the ⋯ menu.
- **The head of the column, fixed.** Three rows, for the three questions. The **map row** says what (the mode menu, then search with its `/` hint). The **selection strip** says where and who. The **level tabs** say how deep.
- **The selection strip.** One place at each level. One entity has its mark, name, and tag, with its figures on a second line at the root (`SelectedEntity`). A set has a chip for each country, each one wide enough for the longest tag. The Players preset reads "24 players". The strip always ends with **+ Add** (for countries) and the word **Clear**: a × on a chip removes that one country, so a second × for the whole set says less. With no selection, the strip says "Click the map or a row to select", and a multiplayer save has **Select players** at its end.
- **The level tabs (`stack/LevelTabs.tsx`).** List, then Profile (one entity) or Compare (a set), then "Development data" (named by the mode). The names and the order stay, so a tab keeps its place, and the heading says what the list is. The active tab has a 2px brass underline. Each first level has one way in, visible at rest. Under a first level the trail takes the place of the tabs ("Profile › Population"), with Back first, so the column has one navigation row.
- **Modes are parents with variants.** The menu lists only the modes the game has, grouped as Realm, Economy, and People (`control-panel/modeConfig.ts`). A mode that shows one quantity more than one way (Development: Raw · Effective, Wealth · Tax base gap, Population: Size · Growth) puts its variants on a full-width `GameSegmented` at the top of its key. This keeps room for an icon strip of the parents if the game's map-mode icons are bundled.
- **The trail, 32px.** Only under a first level, in the place of the tabs. It names only levels, because the map row names the mode and the strip names the selection. The own level of the selected entity reads "Profile". **Show on map** is at its end when a map mode shows what the level is about.
- **Levels.** The root is **the map's caption**: one story, the same one the map tells. Its 17px heading **states the subject, not the mode** ("Countries by development", "France's locations", "Great powers"), because the map select directly above names the mode (Refactoring UI: labels are a last resort; `captionHeading`). **Details ›** is on the same row, then the variant switch, then the legend, then lists what the mode colours in order (countries, or religions, markets, raw materials, building types), with as many rows as fill the column (measured after a resize settles). In single player the player's own country stays on top of every world ranking. This is a fixed rule, not a control. Each row has a bar whose length compares the rows, relative to the largest shown. A ranking shows the value that it sorts by. A mode that measures an amount (Development, Effective, Wealth, Tax base gap, Population) ranks countries by their total, and the value and the bar show that total in compact form under the metric's total label ("Total Dev"). A mode that measures a ratio (Control, Growth, RGO level) ranks by the ratio, and the world ranking leaves out countries (or materials) with fewer than 10 locations, so that a state with one good location does not lead. Each bar is neutral `ink-300` (the Single-Series Colour Rule). The great powers keep the game's rank, so each row has its rank and a short neutral bar of its Total Eff. Dev. A mode switch sorts the whole level again. **The heading follows the scope.** "Great powers" names the world's ranking, so only the root has it. One country in Political reads "France's subjects" (or "… overlord" when it has only an overlord). The great-power list has a band that says what sets its order ("Great power rank"), because its Total Eff. Dev column is not in order. The save holds the score that sets the order (`great_power_points`), but the `eu5save` parser does not read it yet, so the list cannot show it. **Details ›** opens the wide insight, because that way in belongs to the mode, not to its last row. A row of parts of one whole (Religion) shows a share beside the count. Rows carry no sub-lines anywhere in the column, and the root carries no instructions: teaching the ways in (click the map, shift-drag an area, `/` to search) belongs to onboarding. **One row grammar.** Every list in the column uses `RankRow` or `Row`, and both take their slots from `rowClass` and `rowColumns` in `stack/parts.tsx`: swatch or icon, label, bar, value, then an optional chevron. Rows are 30px, swatches are square 12px with the rim, bars are 6px on the track (64px long, or 40px beside a second figure, so the name stays whole) with a 1–2px radius and at least 2px for a value that is not zero, hairlines are full-bleed and one step fainter than a group's rule (`line-faint`), a band has 10px of space above it so that space and not rules makes the groups (Refactoring UI: fewer borders), names are at x=14, and there is no card around the rows. A list in which no row has a colour has no swatch column, so its names align with the band and the heading. **The value edge is one line in every list:** each list reserves one slot for the chevron (`rowEnd`), also a list with no chevron, so the values, the band's column label, and the word "Details" end 24px from the edge (Gestalt: alignment; the header labels the column that ends under it). **All chevrons of a column are on one vertical line:** a row's, the one on the selected block, and the one on Details all use `RowChevron`, in `ink-300`, and the arrow head ends on the 14px gutter line, under × and the other icons. A row's value has medium weight, which does not move a figure in the mono. Ranks and unit labels are `ink-300`, also on the brass strip, and tags stay the quiet `ink-500`. **The player's row** has a small explicit tag, "You" in single player and "Player" in a multiplayer save, which does not tell which player reads it. The tag replaced a ring on the swatch and a raised ground that had no stated meaning. The row stays on top. A generated tag (one with digits, such as AAA67) tells nothing, so a list shows the name alone; a chip and a Compare head need a short form, so a chip keeps the tag and a Compare head shows the name. A location's overview is key and value rows of this kind, numbers in the mono and names in the sans, under an `Overview` band that keeps the rows that go somewhere apart from the rows that tell something. The caption leaves out the development, population, and control that its block gives, and each row that repeats the mode's answer (Owner in Political, Market and Market Access in Markets, Religion in Religion, RGO Level, Wealth). The answer of Political and Markets is a link, so the jump stays. A location's own level shows all the rows. **Rows run to the edge.** The default is full-bleed rows at one height of 30px, also for the Overview rail and for tables (`flush`), with no card. A profile is its title (the plate, the name at heading size, the tag, one stat line), then one row for each part of the entity, then its overview. The Overview marks a percentile among all countries with a thick 3px mark on a track, with a short dim notch at the median, and the first band says so ("Mark: percentile of 646 countries"). A mark does not read as a value bar and does not saturate, where a filled bar beside a value reads as that value's length. A percentile gives one meaning to each mark, where a ratio to the largest country lets one giant flatten the row. **A level leads with one finding** that is computed from the data, never written by hand, and that is left out if it cannot be computed ("Short on Cloves, Pepper", "Rome leads 10 of 12 metrics", "Top 10% of locations hold 20% of development"). A readout in a level has no fill and no border. The tabs that profiles had became these rows. A part with charts, such as a market's goods, opens as a wide level and does not stay in the narrow overview. A grid in a level follows the column's width (`@container`), never the window's, because a wide window does not make the column wide.
- **A level has one of two widths.** 340px for the caption and for a level that is one list; 640px (at most 62% of the frame) for an analysis. More widths move the map at each step and teach nothing. Compare with five countries or more scrolls sideways, and Expand gives a level the whole frame, with the map as an inset.
- **One row template.** Each 340px list has the mark slot (16px, a swatch or an icon), the name, a 64px bar, a 56px value, and the end slot, so that the mark, the name, the bar, and the value have one x in each list (`rowColumns`). A group in which no row has a mark has no mark slot, so its names start on the 14px gutter with the band's label; the bar, the value, and the end slot stay on their lines. A row without a mark in a group with marks keeps the slot empty. A rank is in the slot of the bar. A list with two figures (Religion, a market's imports) has no bar: the long tail makes it a sliver. The great powers have no bar: the list is in rank order, so the band has `Rank ▲`, the same sort mark as a table head, and Eff. Dev is dim and secondary. A long name goes to a second line.
- **What a row promises.** A list row selects, and a tab opens the level. A country's row ends with + to add it, or × to remove it when it is in a set of countries. A list leads with a computed line ("Rome leads with 25.5K"). The row's mark stays on hover, because it is the key between the row and the map. In a list of locations the mark is the colour that the map gives that location (`rampColor`), so the list is also a key.
- **A level leads with its finding.** One sentence computed from the data, at 16px medium, ahead of the hero stat (`Finding`): Compare, a profile, Population, Goods, Locations, Details. Each level has one hero stat style (`InsightReadout`, 20px mono) and one secondary style (`Stat`: 12px mono value and 12px sans unit).
- **Path rules.** The path never repeats an entity: opening one already in it goes back to it. The root is always the caption. A selection narrows the caption in place and never replaces it: one country has its block in the head (the block opens its profile), and its rows become that country's locations by the mode's value (its overlord and subjects in Political, its religions, markets, materials, or buildings in those modes). One market lists its goods in the order and the measure of the Goods level: by imbalance in value, with the same diverging bar, the same icon, and the same signed figure ("+715.9", "−3.3K"). One location leads with the mode's answer: its value large over the brass legend marker, or in a mode without a scale its owner, its market and access, or its main religion and the share of its people. Its profile rows follow in place. A new selection starts a new path; opening a profile pushes a level. A country row opens the country as the selection, so the selected block and the profile always agree; a country that is already in a set of countries opens on top of the path and the set stays. Esc pops a pushed level, and at the caption it goes on to the map, which clears the selection. Another parent mode closes only the levels of the mode (Details and the levels above it); profiles, their sections, and Compare stay. A variant keeps the whole path, so an insight can hand off to its sibling view.
- **Additive selection.** Each control answers one question: the map mode is what the map measures, the selection is where and who (a country, a market, a location, a box, a set of countries, or the Players preset), and the level is how deep the reader goes. Shift-click or Cmd-click on the map adds the entity under the pointer, Alt-click removes it, and Shift-drag adds an area. In the column, a country row that is not in the selection shows a quiet **+** in its bar or rank slot on hover or focus; a country search result has a **+** too, and Shift+Enter or Ctrl+Enter adds the result and keeps search open. A plain click still selects and opens. A touch screen has no hover, so a control that hover shows must not take a tap: the row's **+** is gone there (a tap on a row opens it), and the **+** on a search result always shows, so search is the way to add a country. Each of these controls is at least 24×24px (WCAG 2.5.8). A save change carries a set of countries by country identity, and a country that is gone from the save goes from the set.
- **A set of countries.** The chip bar shows each country as a neutral chip (swatch and tag): the bar keeps the brass, because the bar is the selection, and it has no `Selected` label, so that the same number of chips fits beside **Compare**. Compare is one quiet outlined button in each state (`CompareButton`), with `+` when it adds a country first, because brass is only for the selection and an active state. A click on a chip opens the country; × removes it from the selection. With a pointer, × takes the 24px slot of the swatch on hover or focus, so the tag stays whole. On a touch screen the chip is wider and × always shows, in 24px of its own. The chips that do not fit become one "+N" chip, which opens Compare, and the × of the line clears the selection. **× has one meaning**: it clears the selection, its tooltip is "Clear selection", and it is the rightmost control of the first row under the map row (the block, the chip bar, or the path). Expand is to the left of it. With nothing selected there is no ×. Only Back leaves a level. × does not show at rest with a pointer, because it needs 14px more for each chip, and that costs one chip at 340px. The Players preset still reads "Players", with Compare beside it. The caption ranks the countries in the open mode while the map lights their land.
- **Compare.** A level of the selection: the crumb reads "Development › 4 countries › Compare" or "Development › Players › Compare". Its rows are the Overview figures in their Economy, Society, and State groups, and its columns are the selected countries, at most 8, in the order of the open mode (in the dev order for a mode that does not rank countries). The Players preset compares the players' countries without their subjects. Each column head is a swatch and a tag that opens the profile. A line above the table says what the bars are ("Bar: share of the highest in this row"). Each cell has the value, the world rank (`#293`) in a slot of four characters with 8px before it, so a rank never touches the value, and a 4px bar on one scale for its row, bright only for the row leader, so the distance between countries shows without arithmetic. A row that can go under zero has a zero tick at the track's start, and a value under zero has an empty track, with its sign on the figure. All cells of a row have one rule (`formatMetric`, `formatCount`, or `formatScale`). The first column stays in view when the table scrolls sideways. The only best rank in a row has more weight (not brass). A tie for the best rank has no weight. Each ranked metric is better when it is higher. Expense has no rank, because a large state spends more and a low expense is not better in itself, and its label has a tooltip that says so. Four columns fit at 600px, Expand gives more room, and the table scrolls sideways only when a column cannot have its smallest width. In the level the path says Compare, so the chip bar has no Compare action and the chips have that room. When the selection changes and stays a set of countries, Compare stays open. A country profile shows one country in depth, with its world ranks. The line above says "Rome leads 10 of 12 ranked metrics". A figure that has no rank (Expense) says "no rank" in the rank slot, in the dim token. A tie is a word in the value cells (`tied #1`), not in the label cell. A row is 36px on desktop, so that a cell's bar stands with its value and away from the rule. A value under zero goes to the left of a visible zero line.
- **The map key is on the map (`stack/MapKey.tsx`).** It floats at the bottom left of the map, clear of the column and the timeline, with the mode's variants, the owner borders toggle, and its scale, at each level. It describes the map and not the open level, so it stays. One line names what the scale encodes: "Dev per location · scaled to France". A mode without a scale says what its colours and stripes mean: "Colour: owner. Stripes: occupier". Its ticks are in one precision with rounded ends (0, 36, 72).
- **The camera follows an explicit choice in the column (`frame_color_ids`).** A row, search, an add, and opening Compare frame the subject in the part of the map that the column leaves free. The frame splits the land into groups at wide gaps, in both directions, and a group under half the size of the largest is a colony that does not stretch the frame. A click on the map never moves the camera. **F** and the frame button in the map bar do the same at any time. After the column stops resizing, a reader who pans keeps that view.
- **Direct labels (`stack/MapLabels.tsx`).** The country names of a set are on the map at their capitals, in the same words as the rows, and labels that would touch are left out, with a note that says how many show ("14 of 24 labelled"). The row under the pointer shows its name and value, and a selected location shows its name. The reader never matches a swatch against a colour.
- **A figure can paint the map.** A figure with a map mode has a map glyph on its label (`MapModeLabel`). A click sets that mode, and the figure that the map shows is in brass.
- **Who leads.** Under the ranking of a set of up to 8 countries, a list says which country leads each ranked figure (`SetLeaders`). A tie has no leader, by the same rule as Compare, and reads "Tie (3)". A row opens Compare.
- **Multiplayer.** A player's row has the player's name on a second line, and no row has a tag, so rows keep one rhythm. A Compare column is headed by the country's name and its player. The world list is titled "Great powers and players", because it can skip ranks. The value of that list is the game's great power score, so the rank and the value agree.
- **The exact value stays reachable.** A list is compact (12.1K), and an expert asks why a number is what it is. In Compare, the profile's stat rail, and the stat line, the exact value is in a real tooltip on hover and on keyboard focus (`ExactValue`, `formatExact`). The compact display does not change. The figures of a selected block have one tooltip with the three figures. Each icon button has a tooltip with its name and its key.
- **The inset is measured.** The column publishes how much of the map it covers to the store, and the camera and the timeline read it. Nothing hardcodes the column's width.

### The phone sheet (Game world)

Under the `md` breakpoint the column is a sheet over the map. The desktop column does not change.

- **Three sizes (`stack/sheet.ts`).** Mostly map (30% of the frame), Half (66.5%, the first size), and Mostly sheet (76%). The largest size always leaves 200px of map, which is room for the timeline bar and for the map above it. At 390x844 the sizes are 253px, 557px, and 641px, so the map has 591px, 287px, and 203px. The map stays live at each size.
- **The top of the sheet.** A grabber zone of 24px, then one row: the scale and variants (`MapKey inSheet`), so nothing but the save tag covers the small map. The save name and date are on a small tag at the top left of the map, with Home. The name wraps, so it never truncates.
- **The grabber does what it shows.** The grabber is the full top row behind the text, with the handle in the top 24px of the sheet. No action is in that zone, so all of its width takes a drag. The target goes 20px over the map around the handle. A drag resizes the sheet, and the release goes to the nearest size, or to the next size in the direction of a flick. A tap goes to the next size. A keyboard user has the same sizes: Enter goes to the next size, and the up and down arrow keys go up and down. The accessible name says the size.
- **Fold.** The chrome gives way to the rows (Wroblewski: content before chrome). The map row holds the select, search, the camera, and ⋯. The key has one line: the variants, the unit, and the ramp between its ends.
- **The selected block.** The template of each size: the first line is 44px, with the mark, the name, and the tag, then + Add and Clear at the end. The figures are on the second line.
- **Targets are 44px.** Each target is at least 44px wide and 44px high: Home, the select, search, the camera, Melt, ⋯, the owner link of a location, a chip and its ×, Clear, Back, a crumb, Details, and a segment's height. A list row is one target of 44px. A stat rail row is not a target, so it stays at 30px.
- **A set of countries.** Each chip is 88px, for an open target and a × of 44px each. The chips wrap, so no selected country is out of view.
- **Compare.** Opening it takes the sheet to its top size, and Back returns the size of before (if the reader did not choose another one in the level). The metric's label has its own line above each row, across the width, so four countries fit whole at 390px in equal columns of 92px. The rank is under the value. With five or more the columns are 84px and the table scrolls, and the head of the next column shows at the end. The label stays when the table scrolls. Council round 3, 2026-11-04.
- **Search on a touch screen.** It has × in place of the Esc key cap, and the footer says what a tap does.

### Save and map actions (Game world)

Each action is beside the object that it acts on. The column has no foot, so the level has the full height.

- **The visible buttons follow use.** Melt is the first item of the ⋯ menu, by the owner's decision. Share is in a closed beta, so most players cannot share. Share is a labelled button only when the player can use it: the player can share, an upload runs, the save has its link, or the visitor is on a permalink. Otherwise Share is an item in the ⋯ menu. The order is Share, Melt, ⋯: Melt does not move when the Share label changes. The buttons are `GameButton` `default` with no icon and 8px side padding, one plate and no brass. The buttons sit on the date line, not on the name line: the name is how the player knows the save, so it has a line of its own and the full width before help. Only a name longer than about 236px truncates, and its tooltip gives the full name. A blind first-click test on 2026-11-03 ranked visible labelled actions first, before a menu on the save name.
- **Share changes in place.** Sharing has nothing to configure, so it has no dialog and no status line. The label goes _Share_ → _Uploading 42%_ → _Copy link_. While the upload runs, the button is not available, shows a spinner and a mono `tabular-nums` percent, and its bottom hairline is the track: it fills left to right in `ink-300`, 1px tall, on `transform` with the 180ms settling glide. When the upload lands, the button reads _Copy link_ and takes one 720ms neutral wash (`panel-active` to `panel`); a click copies and shows _Copied_ for 1.8s. A visitor on a permalink sees _Copy link_ with no wash. The tooltip of _Copy link_ is the URL. Brass marks the selection, so the share uses none. Under `prefers-reduced-motion` the wash and the glide are off.
- **The ⋯ menu.** A `GameMenu` (`features/eu5/components/Menu.tsx`): the `GameSelect` plate, 28px items (44px on a phone) with a 16px `ink-500` icon, and an optional quiet note at the end of the item (`GameMenuHint`). Use `GameSelect` for a value and `GameMenu` for an action. The actions on the save file come first, then a divider, then the navigation:
  - **Share**, when it is not a button. A guest sees _Share_ with the note _sign in_, which goes to Steam sign-in and comes back. A player outside the beta sees _Share_ with the note _closed beta_, which opens Discord; the tooltip tells why.
  - **Download save**, for a visitor on a permalink, because the visitor does not have the file.
  - **Add campaign saves** and **Add save folder**, behind the campaign-analysis flag.
  - **Open permalink**, after a share in this session, and **Open another save**, which opens a file as a drop on the page does.
- **The state lives above the buttons.** The menu closes when an action starts, and the save line and the phone row both show the actions, so the upload, the download, the melt, and the hidden file inputs live in `SaveActionsProvider` (`control-panel/SaveMenu.tsx`). While a melt runs, Melt shows a spinner. While a download or an import of saves runs, ⋯ is a spinner.
- **The phone rows.** At 390px the map row is the mode menu, search, Screenshot, Share (when the player can share), and ⋯, each 44px wide.
- **Campaign notices.** Under the campaign stepper, only when they apply: _Analyze campaign_ (or _Resume import_, _Retry import_), the import progress, the saves without readable dates, and the import notices.
- **Screenshot.** A 28px camera icon in the map bar, with a tooltip and an `aria-label`. On a phone it is on the map row. Shift-click saves the full resolution, and the tooltip says so.
- **Owner borders.** A 28px toggle with the visible label "Borders" in the map key (`OwnerBordersToggle` in `stack/MapTools.tsx`), with `aria-pressed`, the name "Owner borders", and the tooltip "Owner borders (B)". It has a checkbox, because it stays on most of the time and a filled button that is always on reads as a badge. On a phone it is an item of the ⋯ menu.
- **The mode name stays whole at 340px.** The map row has only the select and search, so each mode name fits.

### Tooltips

A compact figure in a table keeps its full value in its cell (`Eu5DataTable`). A numeric column has this by default, and a column that holds a ratio gives `exact: formatExactPercent`. The value shows over the cell on hover, and on focus, which is also a tap on a touch screen. The cells of a table have one tab stop, and the arrow keys move between them, so a table of 100 rows does not add 500 tab stops. A figure of three significant figures or fewer already shows in full, so its cell has no value to show and no tab stop.

`rounded-md`, `slate-900/90` ground, `gray-100` text, `text-sm`, 12px × 6px padding, `shadow-md`, at `z-1100`. Entry animates `fade-in-0 zoom-in-95` with a 2px directional slide from the trigger side. Portals into the active game-theme container (not `document.body`) so game tokens still resolve.

### Textures (signature detail)

Two hand-made textures exist and are the system's entire ornament budget:

- The landing page's dark-mode ground: a 300° repeating linear gradient over `slate-800` with a low-opacity SVG wave pattern tiled at 100×18.
- The indeterminate progress bar: 135° diagonal stripes alternating `#036ffc` and `#1163cf` every 20px.

## Do's and Don'ts

### Do:

- **Do** pick the world from the user's job, not the route: analyzing a save is the Game world, everything public-facing is the Classic world.
- **Do** scope every new game palette under `[data-game-theme="<game>"]` and consume it through the semantic `--color-game-*` aliases, never the raw `--game-*` variables.
- **Do** give every game theme a `--game-accent-selection` at 35% of its accent, so text selected inside a game surface reads as selected in that world's colour rather than the browser's.
- **Do** give Game world controls a fixed height from the row scale (28 / 30 / 32 / 36) instead of vertical padding.
- **Do** set every comparable number in IBM Plex Mono with `tabular-nums`, including ranks, dates, and denominators.
- **Do** spend brass on one element per functional group, per the Brass Scarcity Rule.
- **Do** take every focus style from `components/focusRing.ts`, per the One-Focus-Ring Rule.
- **Do** render navigable entity names with `EntityName` (`components/EntityName.tsx`) so the solid ink hairline stays consistent.
- **Do** express in-layout Game world depth as a step on the panel ladder (`panel` → `panel-raised` → `panel-hover` → `panel-active`) plus a hairline.
- **Do** ship floating Game world surfaces as a complete set: translucent ground, `backdrop-blur`, and a shadow (`lg` transient / `xl` docked timeline / `2xl` menu). The column is a wall, not a floating surface: `line-strong` edge, no shadow.
- **Do** move border and background together on Game world hover — `panel` → `panel-hover` _and_ `control-line` → `ink-500`.
- **Do** key Game world panel internals off `@container`, since panels are resizable.
- **Do** recess Game world inputs to `page` color; they sit below their panel, not on it.
- **Do** portal floating Game world content into the theme container so tokens resolve.
- **Do** leave a stat rail bar track empty when the metric has no bounded denominator.
- **Do** let a chart take its text font from the surface. A canvas does not inherit a font, so the EU5 theme sets `--game-chart-font` and `EChart` gives it to ECharts as the global text style. An option sets a family only for numbers (`numFamily`). Surfaces without the token keep the ECharts default.
- **Do** take every chart color from the Plate in `echartsTheme.ts`, and assign categorical slots in fixed order from a stable key — never from a sorted position, or a filter will repaint the survivors.
- **Do** re-run the palette validator against `#0e1217` before changing any Plate value, and keep the recorded ΔE figures in § Charts current.
- **Do** give a chart a legend whenever it carries two or more series, and a 2px surface gap between stacked or adjacent fills.
- **Do** let a row separator that describes the _natural_ order — a rank break, a tier boundary — stand down once the reader sorts the table. `rowSeparator` receives `ctx.sorted` for exactly this; a re-sorted table has no such boundary, and leaving the label in place mislabels whatever now sits at that index.
- **Do** give every authored animation a `prefers-reduced-motion` branch that keeps the state change — a 1ms run so `animationend` still fires, a colour change without the swell, a fade instead of a turn — and disable glides outright while a pointer drags.
- **Do** let overlays that share a map edge read each other's measured size from the store (the timeline bar publishes its height) instead of hardcoding an offset.
- **Do** keep global element resets in `app/styles/styles.css` inside `@layer base`. An unlayered rule outranks every Tailwind utility whatever its specificity; the `:where(img) { height: auto }` reset once silently defeated `h-full` on images until it was moved into the base layer.
- **Do** size a sortable column for whichever is wider, its header or its widest value. The sort glyph costs a header roughly 14px, which is enough to truncate one that fit before sorting was enabled.

### Don't:

- **Don't** put a shadow on a game surface that sits in the layout. Depth is the ladder; shadows belong only to surfaces floating over the map, and only alongside a translucent ground and a backdrop-blur.
- **Don't** exceed 4px radius in the Game world, or use `rounded-full` on anything but a status dot, the active-item bar, or the timeline's playhead knob and play button.
- **Don't** hardcode a game's palette into a shared component — read tokens, fall back to Classic values.
- **Don't** let a status color carry brand, category, or emphasis; it means state and nothing else.
- **Don't** paint a link brass; use the Navigable-Name Rule.
- **Don't** hand-write a focus ring, use `brass-line` or any alpha brass as one, or pair `outline-none` with a ring. All three are how the previous eleven treatments happened — see the One-Focus-Ring Rule.
- **Don't** swap underline semantics: solid navigates, dotted reveals help.
- **Don't** set text a reader must resolve in `ink-rule`, `ink-700` or below, or in the chart Plate's `chartInk.muted`. All are non-text inks — use `ink-500` and `chartInk.tick`, which are the same step, measured to clear 4.5:1. `ink-rule` is for the hairline under a name, never the name.
- **Don't** promote `teal-900` to a brand primary. It is the landing page's band color and belongs to that surface.
- **Don't** set an uppercase micro-label at any size but 11px, above 0.04em tracking, or in anything but `ink-500` mono.
- **Don't** use italic outside the landing hero's second line.
- **Don't** spring, bounce, or overshoot. Every Game world glide is on the settling family (`cubic-bezier(0.22, 1, 0.36, 1)` / `(0.16, 1, 0.3, 1)`) or linear between frames; a spring reads as toy, not instrument.
- **Don't** add faux parchment, gilded frames, wax seals, or any imitation of the game client's own UI textures.
- **Don't** reach for the SaaS dashboard reflex — large-radius cards, pastel gradients, or airy KPI tiles with marketing-scale padding.
- **Don't** introduce neon glow, angular cyberpunk framing, or a second saturated accent hue _in chrome_. The chart Plate is the one sanctioned polychrome domain, and it is bounded by its own register and gates — this rule governs panels, controls, and surfaces, not the inside of a plot.
- **Don't** load a webfont on Classic world surfaces; they intentionally run the platform stack.
- **Don't** put a chart color inline in a builder. Every value comes from the Plate; a one-off hex is how the last palette decayed into 41 of them.
- **Don't** color a chart by rank, or re-encode with color what bar length already shows.
- **Don't** replace a game colour with a Plate colour, or fold a game-coloured ordered set into an ordinal ramp — see the Game-Colour Rule.
- **Don't** hardcode a game colour inline. It goes in `gameColors.ts` so the chart and the surrounding readout can never drift apart.
- **Don't** build a dual-axis chart to juxtapose two _independent_ measures — that manufactures a correlation out of two arbitrary scale choices. Use two charts, small multiples, or index both to a common base. The one sanctioned exception is a **level and a rate derived from it** (EU5's Revenue bars against Net Margin %, `EconomyTab.tsx`), and it is legal only with all three mitigations present — different mark types so axis binding is unambiguous, both axes named, and **the two zeros aligned in pixel space** (`leftMin = -(f·revMax)/(1-f)`, where `f` is the fraction of the rate's range below zero). Removing the zero alignment is what turns this chart back into the anti-pattern. Note the standing limit: relative steepness between the two series is still arbitrary and must never be read as a claim.
- **Don't** give charts a light selection, or read `prefers-color-scheme` inside the Game world. The surface is unconditionally dark.
- **Don't** leave a series' legend swatch to chance. ECharts cannot resolve a colour _callback_ or an unnamed series, and silently falls back to its own default palette — so any series with a callback `itemStyle.color`, or a line series coloured only through `lineStyle`, must also carry an explicit series-level `color`, and every series in a legend needs a `name`.
