import type { PlaythroughId } from "./types";

/** Match the server campaign key. Single player campaigns require the uploader ID. */
export function campaignKeyFor({
  playthroughId,
  multiplayer,
  userId,
}: {
  playthroughId: PlaythroughId | null;
  multiplayer: boolean;
  userId: string | null;
}): string | null {
  if (playthroughId === null) return null;
  if (multiplayer) return playthroughId;
  return userId === null ? null : `${playthroughId}:${userId}`;
}
