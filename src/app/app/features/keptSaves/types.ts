import type { CampaignGame, PlaythroughId } from "@/features/campaign/types";
import type { DateComponents } from "@/features/timeline/date";

export type UpdateMap = "EverySave" | "Daily" | "Monthly" | "Yearly";

/** The campaign and the date of a save. Null fields are not known yet. */
export type KeptIdentity = {
  playthroughId: PlaythroughId | null;
  campaignIdHint: string | null;
  date: DateComponents | null;
  /** The EU4 tag or the EU5 coat of arms of the player. */
  flag: string | null;
  countryName: string | null;
};

export const UNKNOWN_IDENTITY: KeptIdentity = {
  playthroughId: null,
  campaignIdHint: null,
  date: null,
  flag: null,
  countryName: null,
};

/** A copy of a save in this browser. The bytes are in a file that the hash names. */
export type KeptSave = KeptIdentity & {
  hash: string;
  game: CampaignGame;
  identity: "pending" | "ok" | "failed";
  /** The file name at the first copy. */
  name: string;
  /** Every file name that held the same bytes. */
  names: string[];
  size: number;
  /** The last time that the game wrote these bytes. */
  writtenAt: number;
  keptAt: number;
  /** The permalink of the upload, when this browser made it. */
  uploadedId: string | null;
  opfsModified: number;
  /** The watch that last read the save in its folder. */
  watchId: string;
};

/** The settings of the watch of one game. Each change holds the `kept-store` lock. */
export type WatchConfig = {
  game: CampaignGame;
  /** Changes when the player chooses another folder or file. */
  id: string;
  handle: FileSystemDirectoryHandle | FileSystemFileHandle;
  keep: boolean;
  updateMap: UpdateMap;
  wasWatching: boolean;
  lastWatchedAt: number | null;
};

export type FileStat = { size: number; mtime: number };

/** The last known content of a path. */
export type ManifestEntry = FileStat & {
  path: string;
  /** Null for a file that was in the folder before the watch. */
  hash: string | null;
  /** The content that the path had before. */
  previous: string | null;
  /** With other states, `hash` is the content that the path had. */
  state: "held" | "changed" | "gone";
  /** When a listing first showed that the path does not hold its content. */
  changedAt: number;
};

export type MissedSave = FileStat & {
  path: string;
  hash: string;
  reason: "limit" | "disk";
};

/** A file with its campaign, which is null until the file is read. */
export type NewestFile = FileStat & { path: string; playthroughId: PlaythroughId | null };

/** What the watch knows about its folder. */
export type FolderState = {
  game: CampaignGame;
  watchId: string;
  /** The last written files at the start of the watch, newest first. */
  newest: NewestFile[];
  manifest: ManifestEntry[];
  missed: MissedSave[];
};

/**
 * The last time the game wrote a content. It is apart from the copy, as the
 * game can write the same bytes again, and can write bytes that are not kept.
 */
export type SaveWrite = KeptIdentity & {
  hash: string;
  game: CampaignGame;
  seq: number;
  writtenAt: number;
  name: string;
  /** Groups the writes that one run of the watch saw. */
  session: string;
};

export type KeptSettings = { key: "settings"; limit: number; seq: number };

export const GAMES: readonly CampaignGame[] = ["eu4", "eu5"];

export const GB = 1e9;
export const LIMITS = [2, 5, 10, 20, 50].map((x) => x * GB);
export const DEFAULT_SETTINGS: KeptSettings = { key: "settings", limit: 10 * GB, seq: 0 };
