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

/**
 * What a light read of a save tells about its campaign. Neither value needs
 * a parse of the gamestate.
 */
export type SaveIdentity = {
  /**
   * The exact identity. Null when it is not known, such as for an EU4 file
   * that has not been open, because its fingerprint needs a parse of the
   * gamestate.
   */
  playthroughId: PlaythroughId | null;
  /**
   * EU4's metadata `campaign_id`. The same value tells that two saves are
   * of one campaign. A different value tells nothing, because the game can
   * change it within a playthrough. Null for EU5.
   */
  campaignIdHint: string | null;
  date: DateComponents;
};

/**
 * Whether a save is of the campaign of the open save. "unknown" is not
 * "different": the player gave the files together, so the page shows them
 * as one campaign until a parse tells otherwise.
 */
export type Membership = "same" | "different" | "unknown";

export function campaignMembership(save: SaveIdentity, open: SaveIdentity): Membership {
  if (save.playthroughId !== null && open.playthroughId !== null) {
    return save.playthroughId === open.playthroughId ? "same" : "different";
  }
  if (save.campaignIdHint !== null && save.campaignIdHint === open.campaignIdHint) {
    return "same";
  }
  return "unknown";
}

/** The save that is open, as the campaign sees it. */
export type OpenSave = SaveIdentity & {
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
  /** A save of another campaign keeps its mark, with a warning, and can open. */
  membership: Membership;
  problem: LocalSaveProblem | null;
};
