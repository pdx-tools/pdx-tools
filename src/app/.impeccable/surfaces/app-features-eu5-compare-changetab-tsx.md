---
version: 1
slug: "app-features-eu5-compare-changetab-tsx"
primary_target: "app/features/eu5/compare/ChangeTab.tsx"
related_targets: ["app/features/compare"]
---

# EU5 campaign compare (Change tab)

Mode: Operate. Pilot of the shared snapshot comparison layer (`app/features/compare/`), EU5 first.

## Task
A player has the open save and one or more saves of the same campaign (local files, or uploads of that playthrough). They pick a country and an interval, and see what changed and where the change came from. Comparison is live and explorable, not an export.

Ranked use cases (user-confirmed): 1 growth from conquest vs held land (held / gained / lost split per location); 2 who took what from whom (counterparties); 3 control change per location; 4 market position (membership, merchant capacity and power); 5 money totals (no invented breakdown); 6 trend across 3+ snapshots.

## Constraints
- Same playthrough only: another campaign is refused with both names. A different patch is a warning.
- Saves parse in the browser; extra saves parse in a separate worker that is then dropped.
- Show only stored or arithmetic values. Never claim a cause.

## Direction contract
THESIS: The change ledger owns "where did the change come from". It refuses the From/To/Δ table that stops at "that it changed".
OWN-WORLD: EU5 workbench unchanged: slate ladder, brass for the one selected endpoint pair and selected part, stat-rail 30px rows, Plex Mono tabular figures, diverging Plate poles (sanguine loss, indigo gain) for change marks only, game colours for countries and markets.
STORY: The player sees the interval, reads the five domains, opens a row, sees held / gained / lost, clicks a part, and the map paints those locations.
FIRST VIEWPORT: Country panel, Change tab. Top: snapshot strip (campaign saves as stations on a date line, two brass endpoints, add-save control at its end). Below: ledger sections Money, Territory, Population, Development, Control, Markets; each row = label, trend sparkline over all snapshots, end value, signed change. Signature interaction: expand a row into its split; selecting a part paints its locations on the map and lists the top locations.
FORM: Hybrid of candidates 1 (ledger + split) and 2 (map paint), chosen from use-case ranking after the dealt round (seed d5eafd3f) was declined by the user.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Revision 2026-10-02: campaign as a first-class view
The Change tab buried the feature four levels deep (save, country, 7th tab, Add saves). Confirmed with the maintainer:
- Ways in: drop or pick several EU5 saves at once (the newest file by modification time opens; the rest join); auto-discovered uploads of the playthrough (any player) announce themselves on the toolbar; watch the open file handle so each new version (autosave, ironman write) joins and becomes the end. Dropped: a feed "Compare campaign" action.
- World first: the Campaign view sits on the political map (`campaignOpen` in the EU5 store; another map mode or a timelapse ends it). Its panel opens on the world (land that changed hands, player and largest country changes) and drills into the country ledger. The map shows owners on the comparison's end date where the open save's history reaches; a later end says so and offers to open that save.
- Kept: "Uploads of this campaign" (now in the "Other saves" disclosure under the strip). The nearest earlier upload is added once so the first view has an interval.
- Identity: aligned snapshots take the open save's country id by tag (`countryIdsOf`), so a civil-war id swap is not a transfer.
- Entry points: toolbar "Campaign · N saves" (only once another save is known), control panel "Campaign / Compare saves" row (always), country Change tab (same view, held on one country).

