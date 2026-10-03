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

/** What a save's header says about it. */
export type SaveHeader = {
  /**
   * The id the game writes in the header of every save of a campaign: the
   * EU4 `campaign_id` or the EU5 playthrough id. Local files are grouped
   * with it, as it needs no parse of the gamestate.
   */
  campaignId: string;
  date: DateComponents;
};

/** The save that is open, as the campaign sees it. */
export type OpenSave = {
  game: CampaignGame;
  campaignId: string;
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
  | { kind: "upload"; saveId: string; userName: string };

/** Why a local save cannot be opened. */
export type LocalSaveProblem =
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "other-campaign" }
  /** The game wrote a later save over the file. */
  | { kind: "moved"; from: DateComponents };

/** One save of the campaign: one point on its timeline. */
export type CampaignSave = {
  key: string;
  date: DateComponents;
  name: string;
  isOpen: boolean;
  source: CampaignSaveSource;
  problem: LocalSaveProblem | null;
};
