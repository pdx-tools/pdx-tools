---
version: 1
slug: "app-features-hoi4-hoi4ui-tsx"
primary_target: "app/features/hoi4/Hoi4Ui.tsx"
related_targets: ["app/features/hoi4","app/features/timeline","app/features/eu5/components"]
---

# HOI4 save view (One Stack shell pilot)

Mode: Operate. The first game on a game-agnostic shell. EU5 and EU4 can move onto the shell later; that migration is out of scope here. Shaped and confirmed with the maintainer on 2026-10-16. Interactive mockup on a real 1.19 save (13 Feb 1941): https://claude.ai/artifact/UuUTGv9mCyEErygNkWAmax

## Job and audience
A HOI4 player alt-tabs with a 1936–48 save, usually at a desktop. They want the map of their war and the story behind it: who holds what, who fights beside whom, who occupies whom, and what happened when. They take a screenshot or a timelapse for r/hoi4, an AAR, or friends. Positioning (confirmed): HOI4 is a tier-2 analysis game. It gets real surfaces, EU5 stays first for new work, and HOI4 has no leaderboard and no achievements board. PRODUCT.md still says "melt only" and must change with this work. Ask before rewriting the landing copy that says so.

## Why the structure changed
The maintainer's diagnosis of EU5: the map and the data panels do not tell one story. Two navigations (map modes on the left, ledger tabs on the right), cause and effect on opposite walls, and a map squeezed to a thumbnail when data opens. Three dealt structures (seed aa178f55: Briefings, The Key, Balance of Power) were mocked. The maintainer chose a fourth, One Stack, because Briefings and The Key would grow a right panel again as soon as the dossier arrives.

## Shell rules (One Stack)
- **One column next to the map, deeper, never wider.** Choosing and reading happen in the same column. New data adds a level, never a second panel.
- **Width belongs to the level.** Narrow levels are 340px. A wide level (a table, a chart) widens the column, and the map narrows but stays live. Expand gives the level the frame, with the map as an inset that still lights on hover. Stepping back restores the map.
- **Path rules.** The path never repeats an entity: opening one already in it goes back to it. A mode switch resets the path. A map click opens a new path: the mode's entity, then the clicked country. A long breadcrumb collapses its middle into "…".
- **The map lights the deepest level that is a place.** Hovering any row or table row lights its land. Map hover lights the matching row.
- **The bottom edge is time** (see Time). The column says what, the map says where, the bar says when.
- **Each game supplies its modes, levels, events, and kinds.** The shell supplies the stack, the breadcrumb, rows, tables, map linking, the time bar, and the export foot.
- **Visual world:** the Game world grammar unchanged (panel ladder, row heights, plates, whisper labels, flat until floating). HOI4 gets its own `[data-game-theme="hoi4"]` (Sovereign Game Rule). Pick its accent in a small round against real faction and ideology maps, measured to the same contrast floors as EU5.

## HOI4 modes and levels (audited against the save)
- **Political.** Map: the controller's colour, the owner's colour on the border (the renderer already does this). Key: countries by factories held. Wide: a country ledger (government, faction, factories, states, stability, war support, casualties).
- **Occupation.** Map and key: only `occupation_status.occupation` records. Owner ≠ controller is not occupation; it also catches civil-war splits. Key rows are pairs (German Reich in Free France · 13 states · resistance 36%). An occupation level shows resistance, compliance, the most common occupation law, and the states by name. Wide: an occupation ledger.
- **Factions.** Faction `members`, `color`, and `ideology`. Factories share. A faction level shows members with their `faction_join_date`. Wide: a member ledger. Faction colours are very dark (Axis `#514e4a`), so swatches need a light rim.
- **Ideology.** `politics.ruling_party`. Colours from `common/ideologies/00_ideologies.txt`. Factories share.
- **Country level.** Government, faction (with join date), factories held and owned, states, stability, war support, wars and casualties, ships lost and sunk, capitulation date, the host of a government in exile, party popularity, the occupations it holds and suffers, and its own chronology.
- **Playthrough record (player only).** This is the game's "exit to menu" overview, read from `all_playthrough_data`. It is a level under the player's country level, and the row that opens it shows only for player tags. The country level is a snapshot at the save date. The record is the whole campaign up to that date (for example, factories built, not factories held), so it does not repeat the country level. Narrow level, in this order:
  - Header: time in game (`game_months`), hours played (`seconds_played`), world conquered (`conquered_percentage`), years at war (`hours_at_war`).
  - Battles: offensive, defensive, and total; against encircled divisions; with air support; longest battle (days); largest battle; most tanks in a battle.
  - Losses: own and enemy casualties, the worst war on each side (`highest_casualty_war`, `highest_enemy_casualty_war`), and provinces gained and lost.
  - Peaks: largest army, navy, and air force.
  - Feats: nations liberated, successful coups, aces shot, Prides of the Fleet sunk. Ships and tanks built.
  - Factories built, by era: a 3×4 table. The rows are civilian, military, dockyard, and rocket site. The columns are before 1940, 1940–44, and 1945 and later (`*_built_1936/1940/1945`).
  - Production mix: one 100% bar per group (military, air, tank, naval) from the `*_production_*` counters, with the share names under the bar. Shares are honest only within a group, so never compare groups.
  - Doctrine use: the same bar, from the ten `*_xp` counters, split into land, naval, and air.
  - Zero is a real value. A peaceful run shows zeros with no empty state. Hide a group only when all of its values are zero (for example, naval for Bhutan).
  - **`statistics_collection_enabled` does not mean "no data".** Ironman saves (1.17 GER, 1.19 BHU) have `yes`. Two other saves have `no` and still hold values:
    - The MAN 1938 save has `seconds_played=6` and `largest_army=58600`.
    - A 1.17 multiplayer save (GER_1947_02_03_04, 1936–Feb 1947) has thousands of battles, casualties in the millions, and `conquered_percentage=58`.
    
    In the multiplayer save, the time counters are wrong: GER has `game_months=19` and `seconds_played=56` after 133 months of game time, and ITA has `game_months=114` with `seconds_played=0`. Other counters agree with the campaign: GER `hours_at_war=66448` is about 7.6 years, which is 1939–47, and ITA `97144` is about 11 years, which is 1936–47. Which counters stop when collection is off is not known. **Decided (2026-10-19):** show the record with a "partly collected" note and without the time counters.
- **Measure power in factories,** not states: the sum of arms factory, civilian factory, and dockyard levels in controlled states. States mislead: Comintern holds 17% of states but 9% of factories.
- **Stability and war support belong to countries only.** They are bounded 0–100%, so a bar is legal.
- **Names.** A dynamic tag (`D02`) has no name in the save. Name it from `original_tag` plus the ruling ideology loc key (`FRA_fascism` → Nation Française). Cosmetic tags rename countries (`FRA_FREE` → Free France).
- **Tooltip.** State name, owner, "Occupied by" only when an occupation record backs it (else "Controlled by"), government and faction, and resistance and compliance on occupied land.

## Time
- **One bar, one contract, shared with EU4 and EU5.** The shell owns the axis and one activity strip: events counted per period, a height that is the same for every game. Each game supplies events `{date, kind, countries, text}` and its own list of kinds. Kinds are filter chips in the Chronology level, never lanes on the bar. Bins merge to fit the width (a long EU4 campaign is about 1,600 quarters).
- **The cursor always sets "when."** The map follows when the game can show that date. The Chronology level always follows. A selection splits each bar into its own events (bright) over the rest (dim).
- **HOI4 events (one save):** wars entered (`war_relation.start_date`, grouped by date and instigator), capitulations (`diplomacy.capitulated_date`), faction joins after the start date, and capital ships sunk (`history.sunk_ship`, with the strategic region name). Events use each country's base name, because the save keeps only current names.
- **HOI4 playback is PR #1006's saved-date path.** The cursor snaps to the nearest observed save in every mode, and the full save reloads after 250 ms so the column matches. HOI4 has no ownership history, so a single save has no map playback. A campaign also recovers ended wars and the names at the time from the earlier saves.
- **On a save change, the path keeps the deepest level that still resolves.** Carry countries by tag, as #1024 does for EU5.

## Scope and boundaries
- **In:** the shell extraction; HOI4 theme; four modes with their keys and levels; the player's playthrough record; wide ledgers; the time bar with the HOI4 event source; tooltip; the export foot (Screenshot through `create_screenshot_renderer`; Melt only for binary saves).
- **Later:** HOI4 campaign frames (after #1006 merges); leaders (1.19 characters in `character_manager`); naval-loss levels beyond counts; war levels with war-score breakdowns.
- **Remove:** the `JSON.stringify` country dump and the Classic white floating card in `Hoi4Ui.tsx`.
- **Must not change:** EU5 and EU4 behaviour during this work; game-derived colours.
- **Anti-goals:** a second panel; lanes per event kind; any metric the save does not record; a claim of cause. This excludes the army, navy, and air columns and the total score on the game's Statistics tab, because the game calculates them at runtime and does not write them. Its industry and province columns are counts that we already have.

## States and ranges
- Saves are 11–68 MB, streamed and uncompressed. Parse time is not measured yet; measure it before reusing EU5's Parse Wait timings.
- About 250 tags, of which about 88 hold land; 0–6 factions; up to about 130 occupation records; about 250 war pairs; about 400 sinkings, of which about 17 are capital ships; about 110 events by 1941.
- **1936 start:** no wars, factions only at start, no occupations. Each key needs an honest empty state.
- **Map unavailable** (no bundle for the patch, or no GPU): a Game-world state that names the patch and still offers Melt.
- **Mobile:** the map comes first; the column follows under it.

## Build order
1. **Done differently (2026-10-19):** the model lives in `hoi4app::save::SaveModel`, read through `hoi4save`'s generic deserializer in the same single pass. No jomini branch or `[patch]` block. It can move upstream later. The original plan was to land the jomini `hoi4save` model branch, remove the `[patch]` block, and extend the model with the fields above (factions, occupation status, diplomacy war relations, state buildings, `sunk_ship` history, `original_tag`, politics popularity, `all_playthrough_data`, `statistics_collection_enabled`). Each entry in `all_playthrough_data` is an unkeyed pair, `{ "BHU" { data={ first={…} second={…} } … } }`, so it needs a custom deserializer. Model `first` as a map of name to integer plus the three arrays. Do not model about 190 named fields.
2. Extract the One Stack shell from `features/eu5/components` and `features/timeline` into a game-agnostic module, with no EU5 behaviour change (verify with screenshots before and after).
3. Build HOI4 on the shell: theme, modes, levels, tooltip, time bar with HOI4 events, export foot.
4. After #1006 merges: HOI4 campaign frames (state owner and controller per save) on its controller. Do not fork it.

## Open decisions and checks
- `game_unique_id` as the HOI4 campaign key: verify it is stable across saves and across hosts in multiplayer.
- Timelapse export from campaign frames: #1006 replaces `TimelapseExport` with a speed select in campaign playback. HOI4 needs export on frames, or it has no timelapse.
- `war_score.captured_provinces`: does the list grow over the war, or show only current holdings?
- Occupied factories: count fully, or scaled by compliance as the game does.
- Faction leader: no field has been found yet.
- The neutrality label: verified as "Non-Aligned" (`neutrality_noun` in the English localisation). Ideology colours verified against `00_ideologies.txt`.
- Occupation records also cover owned land of another culture (Britain in Egypt at the 1936 start). Only record states that another country owns count as occupied.
- Playthrough record: `first` holds the live values, but `second` is all zeros in both saves. It may be the previous best, which `new_bests` compares against. Do not show it until we know. Also unverified: the units of the `*_production_*` counters (Bhutan has `military_production_equipment=1868000`), whether a tag switch adds an entry, `first_tag` (`yes` in single-player saves, `no` in both multiplayer entries), and which patch added the block. The block is present in 1.17 and 1.19. Verified: `hours_at_war` is game hours. There is one entry for each player *tag*, never for AI countries. In the multiplayer save, two users share GER and get one GER entry, and ITA gets its own entry. So the record belongs to the country, not to the user, and a multiplayer save offers it on each player country.
- The per-country `history_queue` buffers: their semantics are unverified; no chart may use them until verified.
