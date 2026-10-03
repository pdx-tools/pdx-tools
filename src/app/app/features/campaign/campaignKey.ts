/**
 * The key of a campaign, as `campaignKey` in `server-lib/db` builds it. A
 * multiplayer campaign is its playthrough id. A single-player campaign
 * belongs to one user, so its key also names that user. Keep the two
 * functions in step, so that the timeline of a save shows the same
 * campaign as the feed.
 *
 * Returns null when the campaign is single player and the user is not
 * known, such as for a local save when nobody is logged in.
 */
export function campaignKeyFor({
  playthroughId,
  multiplayer,
  userId,
}: {
  playthroughId: string;
  multiplayer: boolean;
  userId: string | null;
}): string | null {
  if (playthroughId === "") return null;
  if (multiplayer) return playthroughId;
  return userId === null ? null : `${playthroughId}:${userId}`;
}
