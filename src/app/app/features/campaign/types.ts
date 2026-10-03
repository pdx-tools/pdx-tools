import type { DateComponents } from "@/features/timeline/date";
import type { FeedGame } from "@/server-lib/fn/feed";

/** The games whose saves a campaign can step through. */
export type CampaignGame = FeedGame;

/**
 * A save on the player's disk, in the shape that the EU4 and EU5 inputs
 * also use. The campaign keeps the reference and never the bytes, so a
 * save that the game overwrites or the player deletes fails when it is
 * opened.
 */
export type LocalSaveRef =
  | { kind: "file"; file: File }
  | { kind: "handle"; file: FileSystemFileHandle; name: string };

/** The file name of a local save. */
export function localSaveName(ref: LocalSaveRef): string {
  return ref.kind === "handle" ? ref.name : ref.file.name;
}

/** The save that a step through the campaign opens. */
export type CampaignStepTarget =
  | { kind: "upload"; saveId: string; name: string; uploaderId: string | null }
  | { kind: "local"; ref: LocalSaveRef };

/**
 * The same stable identity stored as `playthrough_id` on the server: the
 * EU4 gamestate fingerprint or EU5's playthrough id. EU4's raw metadata
 * `campaign_id` is a separate value and is not used to group saves.
 * It is never empty; make one with `toPlaythroughId`.
 */
export type PlaythroughId = string & { readonly __brand: "PlaythroughId" };

/** An empty value has no known playthrough. */
export function toPlaythroughId(raw: string): PlaythroughId | null {
  return raw === "" ? null : (raw as PlaythroughId);
}

/** True when both saves have the same known playthrough id. */
export function samePlaythrough(a: PlaythroughId | null, b: PlaythroughId | null): boolean {
  return a !== null && a === b;
}

/** The playthrough and date read from a save, without loading map assets. */
export type SaveHeader = {
  /** Null when no stable playthrough identity is available. */
  playthroughId: PlaythroughId | null;
  date: DateComponents;
};

/** The save that is open, as the campaign sees it. */
export type OpenSave = SaveHeader & {
  game: CampaignGame;
  /** More than one human player, as the server counts it for the campaign key. */
  multiplayer: boolean;
  /** The file name of the save. */
  name: string;
  source:
    | { kind: "upload"; saveId: string; uploaderId: string | null }
    | { kind: "local"; ref: LocalSaveRef };
};

export type CampaignSaveSource =
  | {
      kind: "local";
      entryId: string;
      /** The name of the player who also uploaded a save of this date, if any. */
      uploadedBy: string | null;
    }
  | { kind: "upload"; saveId: string; uploaderId: string | null; userName: string };

/** Why a local save cannot be opened. */
export type LocalSaveProblem =
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "other-campaign" }
  /** The game wrote a later save over the file. */
  | { kind: "moved"; from: DateComponents };

/** Why a save of the campaign did not open. */
export type OpenFailure =
  /** A local file that no longer holds the save of its mark. */
  | { kind: "local"; problem: LocalSaveProblem }
  /** The game could not load the save. */
  | { kind: "load"; error: unknown }
  /** The save could not be opened, such as when navigation fails. */
  | { kind: "unavailable" };

export type OpenResult =
  /** The page input and route changed. The game can still be loading. */
  | { kind: "navigated" }
  /** The save is open already, or another save is opening. */
  | { kind: "busy" }
  /** The operation ended because the session or page changed. */
  | { kind: "cancelled" }
  | { kind: "failed"; failure: OpenFailure };

/** One save of the campaign: one point on its timeline. */
export type CampaignSave = {
  key: string;
  date: DateComponents;
  name: string;
  isOpen: boolean;
  source: CampaignSaveSource;
  problem: LocalSaveProblem | null;
};
