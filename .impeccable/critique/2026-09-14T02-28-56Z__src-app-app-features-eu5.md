---
target: src/app/app/features/eu5
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/nick/projects/pdx-tools/src/app/app/features/eu5"
timestamp: 2026-09-14T02-28-56Z
slug: src-app-app-features-eu5
---
Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score — 26/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Search "France" + Enter selects Regensburg with no feedback (Eu5Toolbar.tsx:74); "Players" on a no-player save silently clears the selection (Eu5Toolbar.tsx:92) |
| 2 | Match System / Real World | 3 | Sidebar "Political" vs panel "Great powers" (modeConfig.ts:9, Eu5InsightPanel.tsx:212); Control 1.00 vs 100.0% across profile/legend/tooltip |
| 3 | User Control and Freedom | 3 | No way back from Players-wiped selection; no keyboard path to map modes or panel toggle |
| 4 | Consistency and Standards | 2 | Classic ToggleGroup (sky) in Game world (Markets.tsx:435, GoodsTab.tsx:249); SectionTitle retyped 13×; StatItem label ink-300 (StatItem.tsx:32); no focus ring Breadcrumb.tsx:132, ViewToggles.tsx:22 |
| 5 | Error Prevention | 2 | Search bug; Players never disables; Shift-for-full-res only in hover hint (ActionsRail.tsx:27) |
| 6 | Recognition Rather Than Recall | 3 | Unlabeled actions rail + "Hover an action"; Alt-click-to-remove undocumented (EntityLink.tsx:296) |
| 7 | Flexibility and Efficiency | 3 | No number keys for modes, no key for panel toggle or tab cycling |
| 8 | Aesthetic and Minimalist Design | 3 | Control panel ~55% void; location Overview ten KPI tiles (location/OverviewTab.tsx:15-26); n=1 histograms |
| 9 | Error Recovery | 3 | Panel error offers no action (Eu5InsightState.tsx:56-64) |
| 10 | Help and Documentation | 2 | Shortcut panel overflows 900px with no scroll (Eu5ShortcutPanel.tsx:253-297); five "Click" rows; "Empty" as a key |

## Design Specificity Verdict
Authored, not templated (brass mode bar, stat rail ordinals, question-phrased sections, parse-wait/error surfaces). Drift: the right panels speak a different label dialect from the shell (sans semibold tracking-widest retyped 13× instead of SectionTitle; StatItem ink-300; MapModesSection duplicates SidebarNav) and a Classic ToggleGroup with sky selection leaked into Markets.tsx:435 / GoodsTab.tsx:249. Detector CLI: 4 advisory design-system-font-size; 2 FP (7.5px superscripts documented), 2 TP (EntityLink.tsx:30 13.5px; TimelineReadout.tsx:20 20px vs DESIGN.md's 17px ceiling — DESIGN.md self-contradicts). In-page: dominated by Classic landing bleed-through under the fullscreen view; real in-scope: Players button 10.5px (Eu5Toolbar.tsx:146). Headless only, no [Human] overlay tab.

## Priority Issues
- [P0] Search selects wrong country — Eu5Toolbar.tsx:74 passes result.locationIdx to selectCountry(countryIdx). Fix: pass result.id; add test. (/impeccable harden)
- [P1] Mobile unusable: Eu5ControlPanel.tsx:8 fixed w-[332px]; at 400px map is 68px, toolbar hidden, timeline squashed. Fix: collapse to rail/sheet below 640px. (/impeccable adapt)
- [P1] Toolbar collides with insight panel at ≤1280 — Eu5Toolbar.tsx:104 centers on viewport; panel default 640px (Eu5InsightPanel.tsx:120). Fix: center in remaining map column from store widths. (/impeccable layout)
- [P1] Two label dialects + Classic control in Game world — ToggleGroup sky (Markets.tsx:435-446, GoodsTab.tsx:249-260); SectionTitle retyped 13×; StatItem.tsx:32 ink-300; MapModesSection.tsx:97-143 duplicates SidebarNav; EntityLink.tsx:30 13.5px; Players button 10.5px. Fix: GameSegmented on Chip/GameButton tokens; mono ink-500 10px/0.14em labels; SidebarNav; resolve 20px/17px contradiction. (/impeccable polish)
- [P2] Control panel ~55% void, legend orphaned at foot — Eu5ControlPanel.tsx:12 flex-1 spacer. Fix: legend under active mode; group modes Political/Economy/Society. (/impeccable layout)
- [P2] Players preset silently empties selection — Eu5Toolbar.tsx:92-94. Fix: hide/disable when no players. (/impeccable harden)

## Persona Red Flags
- Alex: wrong-country search; no panel-toggle/mode keys; ? panel overflows; invisible focus on breadcrumb/Owner Borders; Income column always 0.00 (Political.tsx:133-148); "1 LOCATIONS" (Eu5InsightPanel.tsx:322).
- Jordan: "‹ GREAT POWERS" handle vs "Political" sidebar; unlabeled actions rail with italic placeholder; "Empty + Click"; phone unusable.
- Sam (AAR author): only export is map PNG; chart ticks in ECharts sans not Plex Mono (DevelopmentInsight.tsx:315-329); revenue axis "1 1 1 0 0 0"; population axis 100,000,000 vs header 356,747,179; in-layout shadow-sm on flag (Eu5InsightPanel.tsx:310).

## Minor Observations
- Eu5InsightPanel.tsx:124 shadow-xl backdrop-blur on opaque bg-game-panel.
- Eu5SelectionPill.tsx:127 left-84 is 4px off the 332px edge; second brass element.
- rounded-full bars: GradientLegend.tsx:34, BuildingLevels.tsx:151-153, GoodsTab.tsx:126-128; GoodsTab.tsx:121 row off the row scale.
- Three tracking values for one label role (0.15/0.18/0.28em).
- Second italic: Eu5DataTable.tsx:629. animate-pulse skeletons vs still loader.
- Political tooltip omits owner. Location title bare name (Regensburg ×2).
- LocationsTab histograms at n=1; MarketProfile gates at n≥5.
- Classic landing stays mounted under fullscreen view (A-23-loading.png; pollutes detector).
- Out of scope: landing "New" badge white on emerald-500 ~2.5:1.

## Questions to Consider
1. Why does the insight panel start closed when the promise is "faster than the ledger"?
2. Could the control panel be a 200px rail with legend/View beside the active mode?
3. Is remove-from-selection the right scoreboard row gesture, or pin-and-compare?
4. Which panel with "copy as image/table" would appear in the most AARs?
5. Is the panel "the insight for this mode" or "a report sharing a mode"? "Political · Great powers"?
