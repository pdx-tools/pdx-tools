import { create } from "zustand";
import type { CampaignGame } from "@/features/campaign/types";
import { dayNumber } from "@/features/timeline/date";
import type { RejectedFile } from "./capture";
import { DEFAULT_SETTINGS, LIMITS } from "./types";
import type { FolderState, KeptSave, KeptSettings, SaveWrite, WatchConfig } from "./types";

type WatchPhase =
  | "off"
  /** The browser asks before it gives the folder again. */
  | "paused"
  | "watching"
  | "elsewhere"
  | "no-access"
  | "not-found";

export type GameWatch = {
  phase: WatchPhase;
  since: number | null;
  /** The files of the folder were read once, so a write is new. */
  isCaughtUp: boolean;
  writing: string | null;
  rejected: RejectedFile | null;
  /** What a resumed watch found. It stays until the next write. */
  resumed: { kept: number; from: number; to: number } | null;
};

export const IDLE_WATCH: GameWatch = {
  phase: "off",
  since: null,
  isCaughtUp: false,
  writing: null,
  rejected: null,
  resumed: null,
};

/** Lookups over the records, so that a row does not search them. */
export type KeptIndex = {
  saves: ReadonlyMap<string, KeptSave>;
  writes: ReadonlyMap<string, SaveWrite>;
  /** The last write of each game, and of each campaign by game and id. */
  latest: ReadonlyMap<string, SaveWrite>;
  /** The last write of each game that has a copy. */
  latestKept: ReadonlyMap<string, SaveWrite>;
  /** By the hash of a save, the write of a later date that the game left for it. */
  wentBack: ReadonlyMap<string, SaveWrite>;
  /** The contents that the watched folders hold. */
  held: ReadonlySet<string>;
};

const campaignKey = (game: CampaignGame, playthroughId: string) => `${game}:${playthroughId}`;

export function indexKept(
  saves: readonly KeptSave[],
  writes: readonly SaveWrite[],
  folders: readonly FolderState[],
): KeptIndex {
  const bySave = new Map(saves.map((save) => [save.hash, save]));
  const latest = new Map<string, SaveWrite>();
  const latestKept = new Map<string, SaveWrite>();
  const wentBack = new Map<string, SaveWrite>();
  const before = new Map<string, SaveWrite>();
  for (const write of writes.toSorted((a, b) => a.seq - b.seq)) {
    const { game, playthroughId, hash, date, session } = write;
    latest.set(game, write);
    if (bySave.has(hash)) latestKept.set(game, write);
    if (playthroughId === null) continue;
    latest.set(campaignKey(game, playthroughId), write);
    if (date === null) continue;
    const run = `${session}:${campaignKey(game, playthroughId)}`;
    const left = before.get(run);
    if (left && dayNumber(left.date!) > dayNumber(date)) wentBack.set(hash, left);
    before.set(run, write);
  }
  return {
    saves: bySave,
    writes: new Map(writes.map((write) => [write.hash, write])),
    latest,
    latestKept,
    wentBack,
    held: new Set(
      folders.flatMap((folder) =>
        folder.manifest.flatMap(({ hash, state }) => (hash && state === "held" ? [hash] : [])),
      ),
    ),
  };
}

export type KeptState = {
  /** Null until the first read of the database. */
  saves: readonly KeptSave[] | null;
  writes: readonly SaveWrite[];
  index: KeptIndex;
  /** The copies that the browser lost. */
  missing: ReadonlySet<string>;
  watches: Partial<Record<CampaignGame, WatchConfig>>;
  folders: Partial<Record<CampaignGame, FolderState>>;
  settings: KeptSettings;
  /** The free space and the persistence that the browser reports. */
  storage: { available: number; persisted: boolean } | null;
  live: Record<CampaignGame, GameWatch>;
};

/** The database as this tab last read it, and the watches that this tab runs. */
export const useKept = create<KeptState>()(() => ({
  saves: null,
  writes: [],
  index: indexKept([], [], []),
  missing: new Set(),
  watches: {},
  folders: {},
  settings: DEFAULT_SETTINGS,
  storage: null,
  live: { eu4: IDLE_WATCH, eu5: IDLE_WATCH },
}));

/** A tab watches the game, this one or another one. */
export const isActive = ({ phase }: GameWatch) => phase === "watching" || phase === "elsewhere";

export function setLive(game: CampaignGame, change: Partial<GameWatch>) {
  useKept.setState(({ live }) => ({ live: { ...live, [game]: { ...live[game], ...change } } }));
}

export const findKept = (hash: string | null): KeptSave | undefined =>
  useKept.getState().index.saves.get(hash ?? "");

/** The last content that the game wrote, in all campaigns. */
export const latestOf = (index: KeptIndex, game: CampaignGame): SaveWrite | null =>
  index.latest.get(game) ?? null;

/**
 * The last content that the game wrote in a campaign. The content on screen
 * is of its campaign also before its write was identified.
 */
export function latestInCampaign(
  { latest, writes }: KeptIndex,
  game: CampaignGame,
  playthroughId: string | null,
  openHash: string | null,
): SaveWrite | null {
  const found = playthroughId && latest.get(campaignKey(game, playthroughId));
  const open = writes.get(openHash ?? "");
  if (!found || !open) return found || open || null;
  return open.seq > found.seq ? open : found;
}

export const sizeOf = (saves: readonly KeptSave[]) =>
  saves.reduce((total, save) => total + save.size, 0);

/** The space that the copies in storage take. */
export const usedBytes = ({ saves, missing }: Pick<KeptState, "saves" | "missing">) =>
  sizeOf((saves ?? []).filter((save) => !missing.has(save.hash)));

/** How many more saves of the size of the last one there is room for. */
export function roomFor(
  state: Pick<KeptState, "saves" | "missing" | "settings" | "storage">,
  size: number | undefined,
): number | null {
  if (!size || state.saves === null) return null;
  const left = Math.min(
    state.settings.limit - usedBytes(state),
    state.storage?.available ?? Number.POSITIVE_INFINITY,
  );
  return Math.max(0, Math.floor(left / size));
}

/** The size that the next save of a game can have. */
export function lastSize(saves: readonly KeptSave[] | null, game: CampaignGame) {
  return saves
    ?.filter((save) => save.game === game)
    .reduce<KeptSave | null>((a, b) => (a === null || b.keptAt > a.keptAt ? b : a), null)?.size;
}

/** The limits that the disk has space for. The limit in use is always one of them. */
export function availableLimits(state: KeptState): number[] {
  const { settings, storage } = state;
  const most = storage === null ? Infinity : storage.available + usedBytes(state);
  return LIMITS.filter((limit) => limit <= most || limit === settings.limit);
}

export const nextLimit = (state: KeptState) =>
  availableLimits(state).find((limit) => limit > state.settings.limit);
