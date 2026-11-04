---
target: EU5 One Stack column
total_score: 24
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 3
target_identity: "file:/home/nick/projects/pdx-tools/src/app/app/features/eu5/stack"
timestamp: 2026-11-03T19-00-12Z
slug: src-app-app-features-eu5-stack
---
# Critique 2: EU5 One Stack column (after Lens, pins, Compare, distill)
Method: dual-agent (A: design review · B: detector + browser)

## Heuristics (24/36, Acceptable; #9 n/a)
1 Status 3 · 2 Real world 3 · 3 Control 3 · 4 Consistency 2 · 5 Error prevention 3 · 6 Recognition 2 · 7 Efficiency 3 · 8 Minimalist 3 · 9 n/a · 10 Help 2

## Priority issues
- [P1] Pins cost about 3 actions each (search, open the profile, a dim Pin button) and never show on the map. Compare is an icon with no label. Fix: pin on rows, search results and the identity line, plus a key; chips and compare heads light their land; a "Compare 5" label.
- [P1] Levels leak across the controls: Compare nests under the selection ("Political › Great Britain › Compare"), a parent-mode switch closes Compare and profiles, and a profile opened from a row does not become the selection. Fix: root Compare at the pin line; keep mode-independent levels across a mode switch; make the profile and the selection agree.
- [P1] Development, Wealth and Population rankings still sort by a hidden total; the band label "Largest countries" was not enough. Fix: sort by the value shown, or show the total. "Great powers" vs the "Political" menu. Goods caption vs Goods level: two orders, two meanings of "Value".
- [P2] With a selection, the head stacks 5 bands plus the identity line before the mode heading; on a phone, about half the column. Fix: merge Selected and Pinned into one row; fold the save line on mobile.
- [P2] Location caption buries the mode's answer (Religion for Paris is the 9th tile); the legend rescales to the selection silently. Fix: lead with the mode's value on the legend marker; a quiet "scaled to France" cue.

## Detector
CLI: 3 advisory design-system-font-size (Caption.tsx:131 14px, CompareLevel.tsx:152 9px, ModeRanking.tsx:403 9px). Overlay: EU5 only undersized-ui-text (deliberate small caps; the 10px rank ordinals and legend ticks are real candidates). The search headings are fixed (about 6:1). The 390 overflow is the overlay itself. The landing DOM is still mounted under EU5 (13 per view).

## Minor
Cloves price 0.00 with supply 0 in Cologne; the bold best rank on ties; no rank on Expense; the name is repeated in the crumb and title; the pinned group in world order; Esc at the caption clears the selection with no cue; the 720px wide level at 1280 for 3 Compare columns.
