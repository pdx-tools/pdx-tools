---
target: surfaces touched on imp-tmp (nav, eu4 hub, saves feed, user page)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/nick/projects/pdx-tools/src/app/app/features/saves"
timestamp: 2026-09-22T19-43-04Z
slug: src-app-app-features-saves
---
# Critique: surfaces changed on imp-tmp (nav, /eu4 hub, /saves feed, user page, landing games list)

Score 25/40 (Acceptable). H1 2, H2 3, H3 3, H4 2, H5 3, H6 2, H7 2, H8 3, H9 3, H10 2.

## Priority issues
- [P0] Achievement wall tooltip dead, icons unnamed: AchievementAvatar (avatars/AchievementAvatar.tsx:16) drops the ref and props that Tooltip.Trigger asChild passes (AchievementWall.tsx:53); alt text is "achievement <id>"; className goes on both the Link and the Sprite. Fix: forward the ref and spread the props, take alt from the name, apply className once.
- [P1] One campaign, three layouts and two names: feed filmstrip card, hub text row, and /users/:id stacking full-width SaveCards (CampaignList.tsx:55-93) with the typed name or filename; "latest" at CampaignList.tsx:81; the page title says "Shared saves" while the menu says "My campaigns". Fix: build the user page from FeedEntryCard.
- [P1] The header has no current-location state (AppHeader.tsx: no active or aria-current).
- [P1] The filmstrip opens on its oldest frame, so the selected furthest save is off-screen (FeedEntryCard.tsx:247). Fix: scroll it into view, label it "furthest", add desktop scroll controls.
- [P2] /eu4: "Open a save" has little weight, the patch chips are unexplained, and the difficulty labels are 10px (AchievementWall.tsx:44).

## Detector
CLI: gray-on-color NavigationMenu.tsx:53 (predates the branch, hover state, about 7:1, false positive); font-size advisory Home.tsx:206 (predates the branch). Browser: undersized text AchievementWall.tsx:44; edge-flush scroller FeedEntryCard.tsx:247 (weak); Register button 4.0:1 (predates the branch). CSP and COEP blocked src injection, so the script was injected inline.

## Personas
EU5 alt-tabber: the Games → EU5 feed and its empty state do not offer "open your save locally". Jordan: the EU4 row opens a hub and the EU5 row opens a feed, with no hint in the menu. Casey: the wall cannot be read without hover, and the user page is a long scroll of maps.

## Minor
nav landmark used for the filter (SavesFeedPage.tsx:17); sr-only entry headings; user h1 weight (users.$userId.tsx:91); "Flagship" versus "Melt only" (Home.tsx:224); the melt row lands far from the drop zone; the feed and hub end with no call to action.

## Questions
Lead /eu4 with a map and put the wall second? Make the user page /saves?user= with owner actions? Should the filmstrip drop thumbnails that are nearly identical?
