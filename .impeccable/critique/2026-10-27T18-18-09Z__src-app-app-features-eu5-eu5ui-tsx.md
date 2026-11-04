---
target: EU5 column landing state
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/home/nick/projects/pdx-tools/src/app/app/features/eu5/Eu5Ui.tsx"
target_fingerprint: "sha256:315d51f8941aa8d63af417904bf018125e0ac9dc1b49baff2cc1fd5b20e84727"
target_path: /home/nick/projects/pdx-tools/src/app/app/features/eu5/Eu5Ui.tsx
timestamp: 2026-10-27T18-18-09Z
slug: src-app-app-features-eu5-eu5ui-tsx
---
# Critique: EU5 column landing state (One Stack)

Method: dual-agent (design review + detector/browser evidence).
Use cases: multiplayer comparison; investigating other countries for an edge; telling a country's story.

## Heuristics (23/40)
1 Visibility 3 · 2 Match 2 (Great powers sub "990 countries" on a top-10 table; header "Poland" is playthrough name) · 3 Control 3 (mode change clears path silently) · 4 Consistency 2 (× on rows with no selection; Income 0.00 in tables vs 2.0K profile) · 5 Error prevention 3 (Analyze campaign with one save) · 6 Recognition 1 (box select, shift-click, save stepping, 9 modes hidden) · 7 Flexibility 3 · 8 Minimalist 2 (83% of body empty; Key band holds no key) · 9 Recovery 2 · 10 Help 2.

## Specificity
Parts are product-specific (stat rail ranks, flags, brass, timeline). Landing composition is generic: mechanism (map colouring) before subject (whose campaign, rivals, story). Detector: 0 source findings; in-page undersized text (9.5–10.5px labels, 7.5px rank suffix); contrast passes (min 5.39:1). 14 false positives from hidden home DOM.

## Priority issues
- [P0] Landing has no subject. Fix: root level as a briefing — You row (player country → profile), MP Players scoreboard at 340px, then mode top rows and Great powers; fold key for entity-coloured modes.
- [P1] Capabilities invisible. Fix: one hint line until first selection; Timelapse named in Export row.
- [P1] Campaign import outranks analysis in the head. Fix: one quiet "Campaign" row lower; Analyze only when saves added.
- [P2] Wrong-looking data/copy: Income 0.00 (insights.rs:291 field), × without selection, "990 countries" sub.
- [P2] Use-case gaps: no side-by-side compare; Diplomacy subjects only (no allies/rivals/wars); weak points need select + mode switch; no per-country history/story; SP Players click opens one-row table.

## Personas
First-timer: empty column, no map-click hint, "KEY" without key, asked for more saves. MP rival scout: four-step path to a rival, no military/diplomacy, zero income column. Power user: fine; misses pinning/compare.

## Minor
Dim header date; "Political" twice in 40px; rank cohort missing; Diplomacy level lacks title; Players vanishes silently on observer saves.

## Questions
Does mode switch need to be first control if the root shows your country? Is Great powers the real home screen? When does a campaign become history? What is a one-click "post this" output?
