---
version: 1
slug: "app-routes-users-userid-tsx"
primary_target: "app/routes/users.$userId.tsx"
related_targets: ["app/features/eu5/control-panel/ShareSave.tsx","app/features/eu5/control-panel/ExportRow.tsx","app/features/account/UserSaveTable.tsx"]
---

# EU5 sharing: upload, saves list, admin grant

## Scope and mode

Operate. Three surfaces on one flow: the EU5 upload action in the Game world actions rail, the public user page at `/users/:id` (Classic world) that lists a player's shared campaigns for both games and lets the owner manage them, and an admin-only Features panel on that same page for granting `eu5-upload`.

## Audience and job

- Owner, from "My Saves" right after an upload: reopen, copy the link, delete. The newest thing is what they want.
- Visitor from an uploader's name or a shared profile link: browse what this player has shared.
- Admin, from a Discord request: open the profile, flip the feature, done.

## Decisions (confirmed by the maintainer)

- Admin grant lives on `/users/:id`, visible only to admins. Not on `/account`.
- The saves page is a list of **campaigns** across both games, newest upload first, game carried as a mark on the campaign header. No filter: counts are small (EU5 sharing is a closed beta) and a filter would be chrome without a job.
- A signed-in user without the feature sees the upload action, and pressing it explains the closed beta and how to ask (Discord). Guests get a sign-in nudge.

## Direction contract

THESIS: Sharing has nothing to configure, so it takes no dialog. It is one labelled row at the foot of the control panel (`SHARE`), in the same grammar as `VIEW` and `EXPORT`: the ready row is only the control that commits (Share save); a player knows a local file has no link yet. While the upload runs, the row's own hairline is the track; when it lands, the permalink and Copy link take the same row, so the eye that watched the track fill is already on the link. The category defaults it refuses: a Classic modal in the Game world, a confirm popover with one sentence and a "yes" in it, an unlabeled icon that needs a hover readout to explain itself, and a URL field that cannot show its URL.

OWN-WORLD: Settled by DESIGN.md. Game world for the panel foot: 36px rows, 28px controls, one brass per row, a 1px brass track on the row's hairline, Plex Mono readouts, tooltips for detail. Classic world for `/users/:id`: platform sans, `max-w-5xl`, cards at `shadow-md`, sky for actions, rose outlined for danger.

STORY: The owner presses Share save once, watches the hairline fill, and gets Copy link in the same row without leaving the map. On their page they see campaigns, not files; each card has open, copy link, delete. An admin sees a Features card on any profile and flips a switch; the copy says when it takes effect.

FIRST VIEWPORT: `/users/:id` — heading is the player name, one meta line (joined, N campaigns, N saves). For admins, a Features card directly under the heading, one row per feature (name, description, switch). Then the campaign list: campaign header row (name, game chip, save count, latest game date), then cards. EU5 card: OG preview, playthrough name, game date + version line, uploaded ago + filename, actions right. Empty state teaches how to share.

FORM: Extension of established surfaces; no concept roll (no seed key). The foot rows share `control-panel/footRow.ts`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved

- EU5 metadata has no player country, so the EU5 card leads with the OG preview and playthrough name rather than a flag.
