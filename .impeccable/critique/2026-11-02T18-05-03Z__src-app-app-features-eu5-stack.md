---
target: EU5 One Stack column
total_score: 23
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 3
target_identity: "file:/home/nick/projects/pdx-tools/src/app/app/features/eu5/stack"
timestamp: 2026-11-02T18-05-03Z
slug: src-app-app-features-eu5-stack
---
# Critique: EU5 One Stack column (src/app/app/features/eu5/stack)
Method: dual-agent (A: design review · B: detector + browser)

## Heuristics (23/36, Acceptable; #9 n/a)
1 Status 3 · 2 Real world 2 · 3 Control 3 · 4 Consistency 2 · 5 Error prevention 3 · 6 Recognition 2 · 7 Efficiency 3 · 8 Minimalist 3 · 9 Recovery n/a · 10 Help 2

## Priority issues
- [P1] Root rankings sort by a hidden quantity: Development, Wealth, Effective dev, Population and Control sort by the total but show the average, so the values and bars look unsorted. Political hides the great-power rank. Fix: sort by the value shown, or name the sort key and show the rank. (ModeRanking.tsx)
- [P1] A selection replaces the map's caption: in Religion with France selected, the legend and key are gone while the map paints religion. Fix: keep a compact caption strip at every level, or make the profile follow the mode.
- [P1] Comparison has no home: comparing needs a round trip and memory, and Political Details repeats the root's 10 rows. Fix: a rank and neighbours in context, a pinned second entity, an all-countries ledger.
- [P2] Depth-2 levels are chart walls (Goods, Population, Locations): KPI tiles, a native select, no lead answer. Fix: lead with one answer line, select the good from its bar, put secondary charts behind rows.
- [P2] Unused space and affordances: about 300px empty under 10 rows; Religion/RGO rows look like they open; no Esc to go up a level; about 120px of content on a phone.
- [P2] Search group headings render black on near-black (1.1:1): ColumnSearch.module.css:5 uses var(--color-game-ink-500), which `@theme inline` does not emit. The same bug is in TimelineScrubber.module.css:48,83.

## Detector
CLI: 0 findings in stack/profiles/insights (regex only). Overlay: undersized-ui-text 9.5-10.5px labels (deliberate small caps, but the 10px tags and stat labels are worth weighing); low-contrast on the search headings (real); stripes on StatRail hatch (false positive); 14 per view from the landing-page DOM still mounted under the EU5 UI.

## Minor
"Great powers" is repeated as heading and band; the Effective legend is 0-100 against values of about 11; dark game colours vanish as bars; the 33-item religion legend; Overview labels truncate; scatter labels overlap; the expanded map inset covers the Sankey; Units/Value defaults differ between levels; no rank on Market Value.
