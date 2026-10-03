import type { DateComponents } from "@/features/timeline/date";
import type { FeedGame } from "@/server-lib/fn/feed";

/** The games whose saves a campaign can step through. */
export type CampaignGame = FeedGame;

/**
 * A save on the player's disk. The campaign keeps the reference and never
 * the bytes, so a save that the game overwrites or the player deletes
 * fails when it is opened.
 */
export type LocalSaveRef =
  | { kind: "handle"; handle: FileSystemFileHandle; name: string }
  | { kind: "file"; file: File };

/** The save that a step through the campaign opens. */
export type CampaignStepTarget =
  | { kind: "upload"; saveId: string; name: string; uploaderId: string | null }
  | { kind: "local"; ref: LocalSaveRef };

/**
 * The id the game writes in the header of every save of a campaign: the
 * EU4 `campaign_id` or the EU5 playthrough id. Local files are grouped
 * with it, as it needs no parse of the gamestate. It is never empty; make
 * one with `toCampaignId`.
 */
export type CampaignId = string & { readonly __brand: "CampaignId" };

/** The campaign id of a header value. Older saves have an empty one, which is no campaign. */
export function toCampaignId(raw: string): CampaignId | null {
  return raw === "" ? null : (raw as CampaignId);
}

/** True when both saves have a campaign id and it is the same. */
export function sameCampaign(a: CampaignId | null, b: CampaignId | null): boolean {
  return a !== null && a === b;
}

/** What a save's header says about it. */
export type SaveHeader = {
  /** Null for a save without a campaign id, which no campaign can hold. */
  campaignId: CampaignId | null;
  date: DateComponents;
};

/** The save that is open, as the campaign sees it. */
export type OpenSave = {
  game: CampaignGame;
  /** Null when the header has none; the campaign then holds only uploads. */
  campaignId: CampaignId | null;
  /**
   * The id that the server indexes uploads by. For EU5 it is the same as
   * `campaignId`; for EU4 it is a hash that needs the parsed gamestate.
   */
  playthroughId: string;
  /** More than one human player, as the server counts it for the campaign key. */
  multiplayer: boolean;
  date: DateComponents;
  /** The file name of the save. */
  name: string;
  source:
    | { kind: "upload"; saveId: string; uploaderId: string | null }
    | { kind: "local"; ref: LocalSaveRef | null };
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
  /** The save could not be read, such as an upload that did not download. */
  | { kind: "unavailable" };

export type OpenResult =
  | { kind: "opened" }
  /** The save is open already, or another save is opening. */
  | { kind: "busy" }
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
