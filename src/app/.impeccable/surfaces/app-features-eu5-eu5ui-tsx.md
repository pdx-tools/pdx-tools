---
version: 1
slug: "app-features-eu5-eu5ui-tsx"
primary_target: "app/features/eu5/Eu5Ui.tsx"
related_targets: ["app/features/eu5/control-panel","app/features/eu5/features"]
---

# EU5 save view (One Stack)

Mode: Operate. A refinement inside the Game world: the structure changes, the visual language does not. Shaped and confirmed with the maintainer on 2026-10-27.

## Job and audience
An EU5 player alt-tabs with a save and wants the map first, with the data beside it telling the same story. Before this work, two walls framed the map (a 332px control panel and a 352–640px insight panel), so the map got 756px of a 1440px screen, or 468px with the insight panel at full width. The mode was chosen on one wall and explained on the other.

## Structure
- **One column on the left, 340px at rest.** It replaces both panels. The map bar (the save and the map's tools) and the map key float on the map, because they describe the map and not the analysis. They keep their place when a level widens the column.
- **Head (fixed):** three rows for three questions. The map row says what (the mode menu and search). The selection strip says where and who, at each level, and ends with + Add and Clear. The level tabs say how deep: List, Profile or Compare, and the mode's data, with stable names and one order.
- **Map tools:** Screenshot and Frame the selection are in the map bar, with ⋯, which has Melt first. Owner borders is in the map key, with the variants. On a phone the save is a small tag on the map, and the tools are on the map row.
- **Selection, not pins:** each control answers one question. The mode is what, the selection is where and who, and the level is how deep. The selection adds countries: Shift-click or Cmd-click on the map, a quiet + on a country row or a search result, or Shift+Enter in search. One brass block in the head names one entity at the root, in one template: the mark (a flag for a country, a swatch for another kind), the name, the tag, and a chevron directly after the name as one target, then Compare and × at the end of the line, and the figures on the second line. A location names its owner as a link with the flag ("France / Paris"), and only the chevron at the end opens a level, and a country has a quiet + Compare that opens search in add mode. Below the root the path names the entity and has ×, so the block goes; only a note keeps one line. A set of countries is neutral chips (a click opens, × removes, "+N" overflows, the bar's × clears) and the same quiet Compare button. × has one meaning: it clears the selection, it is the rightmost control of the first row under the map row, and only Back leaves a level. On a touch screen × always shows on a chip, and search is the way to add a country. The caption of a set ranks its countries in the mode. Compare has at most 8 columns in the mode's order, and its path reads "Development › 4 countries › Compare". Revised on 2026-11-03: pins duplicated the selection, cost about 3 actions each and never showed on the map, so the additive selection replaced them.
- **Trail:** only under a first level, in the place of the tabs ("Profile › Population"). It names only levels.
- **Body (scrolls):** the open level. The root level is the map's caption: a heading that states the subject ("France's locations"), then what the mode colours. A list row selects what it names, with a quiet + to add.
- **No foot.** Revised on 2026-11-03: the foot grouped actions by verb, took about 110px of each view, and hid sharing. Each action is now beside its object: the save actions on the save line, the map actions on the map row. The level has the full height.
- **A level has one of two widths.** 340px for a list; 640px (at most 62% of the frame) for an analysis.
- **Path rules.** The path never repeats an entity. A parent-mode switch closes only the mode's own levels (Details); profiles, sections and Compare stay. A country row selects the country and opens it, so the selected block and the profile agree; Esc pops back to the caption narrowed to it. A selection change starts a new path, but Compare stays while the selection is still a set of countries. A save change carries a single selection and a set of countries by identity.
- **The map and the column are one tool:** a row lights its land and names itself on the map; the map lights the matching row; a choice in the column frames its subject in the free part of the map; a set has direct labels on the map; a figure with a map mode paints the map, and the one on the map is in brass.

## Foundations (2026-11-04, council round 1)
- Type floor: small data text is 12px. Only uppercase section labels stay at 11px, at 0.04em, in one token (`sectionLabel`). Ranks are `#293` on the baseline. Round 3.
- Contrast: `ink-500` is 7.2:1 or more on the panels and 6.3:1 on the brass strip. Control edges are 3.7:1 or more (`control-line`), tracks are about 2.1:1 (`track`), and game colours have a 28% white rim (`rim`). Round 3.
- One number form for each kind, and one label for each metric: DESIGN.md, the One-Formatter Rule and the One-Term Rule.
- Charts: 12px text in `ink-500`, numbers and tags in the mono, one neutral colour for one series, ticks on round values and round years. A scatter of countries has a log x axis, and a value at zero or under stays on the left edge with a count under the chart: DESIGN.md, § Charts.
- One row anatomy: `rowClass` and `rowColumns`, with one value edge.
- Exact values: a compact figure in a table shows its full value on hover and on focus, with one tab stop for each table. DESIGN.md, § Tooltips.
- Links: a tab for a first level, a chevron for a level under it, a solid underline for a jump (on row hover only in a table), and a small "?" mark for a glossary term.
- Single-series colour: a bar is neutral whenever its row has a swatch or an icon, and the signal pair is only for sign. A diverging bar has a centre mark, a shortage on the left, and a surplus on the right, in each view.

## Modes
Nine parent modes; derived modes are variants on the root level, so only modes the game has would need an icon.
- Political, Control, Religion, Markets, RGO Level, Building Levels: no variants.
- Development: Raw · Effective. Wealth: Wealth · Tax base gap. Population: Size · Growth.
- Now: a 28px menu in the head names the open mode and opens the grouped list. Later: an icon strip of the nine parents, from a new `pdx-assets` atlas (only the goods atlas is bundled today).
- Campaign stays beside the modes as its own entry in the menu.

## Profiles
Tabs become rows. Country: Overview, then rows to Religion, Population, Diplomacy (narrow) and Locations (wide). Location: Overview, then Economy and Population. Market: summary, then Goods (wide).

## States
- Timeline not live: the "Values are from the save date" note heads the body.
- Playback preview: the body shows "Charts become available when playback pauses"; head and crumbs stay usable.
- Phone: map first, and the column is a sheet over it with three sizes: Mostly map, Half, and Mostly sheet. The sheet has a grabber zone of the full top 24px, then a one-line map key, so nothing but a small save tag covers the map.

## Scope and boundaries
- EU5 owns its shell in `features/eu5/stack/` (maintainer's choice). Part names and props match `features/stack` on the HOI4 branch so a later merge is a rename.
- EU5 keeps its own `TimelineBar`, docked to the map node.
- Must not change: EU4, the HOI4 branch, game-derived colours, the parse wait.
- Removed: the right panel, `InsightPanelTab`, the floating `Eu5Toolbar`, the right viewport inset.

## Open checks
- Canvas resize cost during the width glide on an integrated GPU; snap at the glide end if it drops frames.
- Which EU5 gfx files hold map-mode icons.
