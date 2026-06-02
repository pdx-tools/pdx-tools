import type { SaveResponse } from "@/server-lib/fn/save";

type SaveMeta = Pick<
  SaveResponse,
  | "date"
  | "player_tag_name"
  | "player_start_tag_name"
  | "patch"
  | "achievements"
  | "players"
  | "user_name"
>;

const CTA = "Explore maps, timelines, and economic data.";

/**
 * Builds a per-save OpenGraph/meta description from normalized save fields.
 *
 * Single-player saves lead with the distinctive nation; multiplayer saves lead
 * with the game mode, since the stored player tag is only the uploader's nation
 * and isn't representative of a many-nation game. Returns `undefined` for
 * missing input so callers can fall back to a generic description.
 */
export function saveDescription(m: SaveMeta | null | undefined): string | undefined {
  if (!m) {
    return undefined;
  }

  // The stored patch is four-part (e.g. "1.37.0.0"); readers only care about the
  // major.minor release the save belongs to.
  const patch = m.patch.split(".").slice(0, 2).join(".");

  if (m.players > 1) {
    return `${m.players}-player EU4 ${patch} multiplayer game as of ${m.date}, uploaded by ${m.user_name}. ${CTA}`;
  }

  const nation = m.player_tag_name ?? "An unknown nation";
  // Only note a tag switch when we know the current tag and it differs from the
  // starting tag — "An unknown nation (started as …)" would read oddly.
  const startedAs =
    m.player_tag_name && m.player_start_tag_name && m.player_start_tag_name !== m.player_tag_name
      ? ` (started as ${m.player_start_tag_name})`
      : "";

  const n = m.achievements?.length ?? 0;
  const achievements = n > 0 ? ` with ${n} achievement${n === 1 ? "" : "s"}` : "";

  return `${nation}${startedAs} as of ${m.date}. EU4 ${patch} campaign by ${m.user_name}${achievements}. ${CTA}`;
}
