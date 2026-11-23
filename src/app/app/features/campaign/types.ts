import type { DateComponents } from "@/features/timeline/date";
import type { FeedGame } from "@/server-lib/fn/feed";

export type CampaignGame = FeedGame;

/** Retain a file reference so navigation can check whether it is still available. */
export type LocalSaveRef =
  | Readonly<{ kind: "file"; file: File }>
  | Readonly<{ kind: "handle"; file: FileSystemFileHandle; name: string }>;

export function localSaveName(ref: LocalSaveRef): string {
  return ref.kind === "handle" ? ref.name : ref.file.name;
}

/** The size and modification time of a file, to detect a change since a read. */
export type FileVersion = Readonly<{ size: number; lastModified: number }>;

/** Copy only the version fields, such as from a `File`. */
export function fileVersion(file: FileVersion): FileVersion {
  return { size: file.size, lastModified: file.lastModified };
}

export function sameFileVersion(a: FileVersion, b: FileVersion): boolean {
  return a.size === b.size && a.lastModified === b.lastModified;
}

export type CampaignStepTarget =
  | { kind: "upload"; saveId: string; name: string; uploaderId: string | null }
  | { kind: "local"; ref: LocalSaveRef };

/** Exact campaign identity. Use `toPlaythroughId` to reject empty values. */
export type PlaythroughId = string & { readonly __brand: "PlaythroughId" };

export function toPlaythroughId(raw: string): PlaythroughId | null {
  return raw === "" ? null : (raw as PlaythroughId);
}

/** Campaign identity and date, with unknown fields left null. */
export type SaveIdentity = Readonly<{
  /** EU4 needs a full parse to determine the exact campaign identity. */
  playthroughId: PlaythroughId | null;
  /** Matching EU4 metadata IDs indicate the same campaign. Different IDs are inconclusive. */
  campaignIdHint: string | null;
  date: DateComponents;
}>;

/** Keep unknown membership distinct from a confirmed campaign mismatch. */
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

export type OpenSave = SaveIdentity & {
  game: CampaignGame;
  /** Use the same multiplayer rule as the server campaign key. */
  multiplayer: boolean;
  /** The file name of the save. */
  name: string;
  source:
    | { kind: "upload"; saveId: string; uploaderId: string | null }
    | {
        kind: "local";
        entryId: string | null;
        ref: LocalSaveRef;
        /** The version of the file snapshot used by the full parse. */
        fileVersion: FileVersion | null;
      };
};

type CampaignSaveSource = Readonly<
  | {
      kind: "local";
      /** Null for an open file that is not in the registry. */
      entryId: string | null;
      /** An uploader associated with this timeline date. */
      uploadedBy: string | null;
    }
  | { kind: "upload"; saveId: string; uploaderId: string | null; userName: string }
>;

export type LocalSaveProblem = Readonly<
  | { kind: "missing" }
  | { kind: "unreadable" }
  /** The file now represents another date. */
  | { kind: "moved"; from: DateComponents }
>;

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

/** A timeline point and its navigation source. */
export type CampaignSave = Readonly<{
  key: string;
  date: DateComponents;
  name: string;
  isOpen: boolean;
  source: CampaignSaveSource;
  /** Files from other campaigns remain visible with a warning. */
  membership: Membership;
  problem: LocalSaveProblem | null;
}>;

/** Why the browser has the figures of a save but no file to open. */
export type FiguresOnlyReason =
  /** A watched state on the game's current path. */
  | "writtenOver"
  /** A watched state that the game left when it went back. */
  | "otherBranch"
  /** A save whose file this tab does not have. */
  | "notOpen";

/**
 * A save whose figures the campaign analysis kept, but whose file this tab
 * cannot open, such as a watched state that the game wrote over. It is
 * never a `CampaignSave`, so navigation cannot open it.
 */
export type FiguresOnlySave = Readonly<{
  key: string;
  date: DateComponents;
  name: string;
  isOpen: false;
  source: Readonly<{ kind: "figures"; snapshotId: string; reason: FiguresOnlyReason }>;
}>;

/** A save of the campaign chart: one that opens, or one with figures only. */
export type ChartedSave = CampaignSave | FiguresOnlySave;

export function isFiguresOnly(save: ChartedSave): save is FiguresOnlySave {
  return save.source.kind === "figures";
}
