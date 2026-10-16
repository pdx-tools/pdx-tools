---
target: the new timeline feature
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/nick/projects/pdx-tools-2/src/app/app/features/eu5/timeline"
timestamp: 2026-09-13T01-29-07Z
slug: src-app-app-features-eu5-timeline
closed: true
---
Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score — 29/40 (Good)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | No assistive-tech feedback during playback; panel header date disagrees with bar on a past date |
| 2 | Match System / Real World | 3 | "4 mo /s" is not an intuitive rate |
| 3 | User Control and Freedom | 3 | Locked mode discards scrubbed date; Play at live teleports to start |
| 4 | Consistency and Standards | 2 | aria-pressed + label swap on Play; speed radiogroup without roving tabindex; pill 12px off the bar edge |
| 5 | Error Prevention | 3 | Locked-mode warning tooltip-only |
| 6 | Recognition Rather Than Recall | 3 | Shift/Ctrl modifiers only in tooltips and ? panel |
| 7 | Flexibility and Efficiency | 3 | Global keys dead after any button click |
| 8 | Aesthetic and Minimalist Design | 4 | n/a |
| 9 | Error Recovery | 2 | Worker failures are console.error only |
| 10 | Help and Documentation | 3 | timeline.available=false hides bar silently while ? lists Timeline keys |

## Design Specificity Verdict
Authored where it matters (activity strip, save-date terminal, −N yr return, catch-up mark, Borders-only interlock); the transport + speed control is generic video chrome. Detector CLI: 0 findings. In-page overlay: in-scope hits on 9.5–10.5px micro-labels (speed labels, −7 mo, Map Modes, Borders only); tick-label 2.6:1 is a false positive (SVG color vs fill); body-level glow/stripes/transition findings are detector self-contamination. Real contrast finding (A): ink-500 over the 72% overlay drops to 3.87:1 over sand, 2.84:1 over white map.

## Priority Issues
- [P1] Global timeline keys dead after any mouse click on a button — useTimelineController.ts:147-149. Fix: let arrows/Home/End through on buttons; keep Space guard. (/impeccable harden)
- [P1] Playback inaudible to assistive tech — no aria-live; aria-pressed + label swap (TimelineTransport.tsx:127-128); return button named "−2 yr" (TimelineReadout.tsx:49); note buttons inside role=slider (TimelineScrubber.tsx:147-283); speed radiogroup no roving tabindex. Fix: polite live region in TimelineBar, drop aria-pressed, proper labels, move notes out of slider, roving tabindex. (/impeccable audit)
- [P2] Locked mode discards scrubbed date, hover-only warning — ui-engine.ts:320-333, MapModesSection.tsx:66-76. Fix: remember last historical date, restore on re-entering Political; inline lock glyph + aria-description. (/impeccable harden)
- [P2] formatDistance can print "1 yr 12 mo"; "Mar  8" padStart hole — TimelineReadout.tsx:9-17, :42. Fix: calendar arithmetic, cap months at 11; min-w-[2ch] span. (/impeccable polish)
- [P2] Playback end has no cue; Play at live teleports — ui-engine.ts:409-411, 428-431. Fix: replay glyph + announcement at end; glide to start. (/impeccable animate)

## Persona Red Flags
- Alex: keys dead after button click; Space on focused speed radio does nothing; no typed date; 1px ≈ 219 days on a 300-year campaign at 500px.
- Sam: no live region; aria-pressed + label swap; 4 Tab stops in speed group; buttons inside slider; "−2 yr" name; "Borders only" unrelated span.
- Riley: note markers no collision layout; 3-day campaign has no ticks; available=false silent while ? lists keys; ~1800 rects reclass per frame at 4K; worker error leaves playhead ahead of frozen map.

## Minor Observations
- Panel header date pattern matches bar and disagrees on a past date.
- ink-500 on translucent overlay over bright map below 4.5:1; raise alpha to ~0.82 or use ink-300 for tick labels.
- Three gaps in one corner: bar 16px, pill 8px above, pill left 336 vs bar 348.
- aria-valuetext "8 Mar 1341" vs visible "1341 Mar 8".
- "/s" 9px decoration redundant with group label.
- historicalCountry tooltip should carry the date context.

## Questions to Consider
- Why a floating bar rather than the panel header becoming the scrubber?
- Could non-political modes keep the date (lens change, not loss of place)?
- Is "play" the verb, or "next border change"?
