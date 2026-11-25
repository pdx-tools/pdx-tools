import type { CampaignGame } from "@/features/campaign/types";
import { formatLongDate } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import { isActive, lastSize, roomFor } from "./keptStore";
import type { KeptState } from "./keptStore";
import { formatBytes, savesText } from "./text";

/** The map and the title warn when there is room for fewer saves than this. */
const NEAR_LIMIT = 10;

export type WatchStatus = {
  kind:
    | "off"
    | "no-access"
    | "not-found"
    | "limit"
    | "disk"
    | "failed"
    | "near-limit"
    | "elsewhere"
    | "paused"
    | "loading"
    | "keeping"
    | "not-keeping";
  text: string;
  /** For a row that also has the Latest button. */
  short: string;
  /** The whole sentence, for a tooltip. */
  full: string;
  isWarning: boolean;
  titlePrefix: string | null;
};

const warning = (
  kind: WatchStatus["kind"],
  text: string,
  short: string,
  full: string,
  titlePrefix: string | null = null,
): WatchStatus => ({ kind, text, short, full, isWarning: true, titlePrefix });

const calm = (kind: WatchStatus["kind"], text: string, short = text, full = text): WatchStatus => ({
  kind,
  text,
  short,
  full,
  isWarning: false,
  titlePrefix: null,
});

/** The most important thing to say about the watch of a game. */
export function watchStatus(
  game: CampaignGame,
  state: Pick<
    KeptState,
    "live" | "watches" | "folders" | "saves" | "missing" | "settings" | "storage"
  >,
  view: { failed: DateComponents | null; loading: DateComponents | null } = {
    failed: null,
    loading: null,
  },
): WatchStatus {
  const config = state.watches[game];
  const { phase } = state.live[game];
  const loading = view.loading && `Loading ${formatLongDate(view.loading)}`;
  const load = () => calm("loading", loading!, "Loading");
  if (config === undefined) return loading ? load() : calm("off", "Watch save");

  if (phase === "no-access") {
    const full = `The browser no longer allows “${config.handle.name}”. Open for details.`;
    return warning("no-access", "Not watching, no access", "No access", full, "Not watching - ");
  }
  if (phase === "not-found") {
    const full = `“${config.handle.name}” was not found. Open for details.`;
    const text = "Not watching, folder not found";
    return warning("not-found", text, "Not found", full, "Not watching - ");
  }

  const active = isActive(state.live[game]);
  const room = roomFor(state, lastSize(state.saves, game));
  if (active && config.keep) {
    const missed = state.folders[game]?.missed ?? [];
    if (missed.some((x) => x.reason === "disk")) {
      const full = "Not keeping: the disk is full. Open for details.";
      return warning("disk", "Not keeping, disk full", "Not keeping", full, "Not keeping - ");
    }
    if (missed.length > 0 || room === 0) {
      const limit = formatBytes(state.settings.limit);
      const full = `Not keeping: the ${limit} limit is reached. Open for details.`;
      return warning("limit", "Not keeping, limit reached", "Not keeping", full, "Not keeping - ");
    }
  }
  if (view.failed !== null) {
    const text = `Could not load ${formatLongDate(view.failed)}`;
    return warning("failed", text, "Not loaded", text);
  }
  if (active && config.keep && room !== null && room < NEAR_LIMIT) {
    const full = `Room for about ${savesText(room)}. Open for details.`;
    const prefix = `Room for ${savesText(room)} - `;
    return warning(
      "near-limit",
      `Room for about ${savesText(room)}`,
      `Room for ${room}`,
      full,
      prefix,
    );
  }
  if (phase === "elsewhere") return calm("elsewhere", "Watching in another tab", "Another tab");
  if (phase === "paused" || phase === "off") return calm("paused", "Watching paused", "Paused");
  if (loading) return load();
  return config.keep
    ? calm("keeping", "Watching, keeping copies", "Watching")
    : calm("not-keeping", "Watching, not keeping", "Not keeping");
}
