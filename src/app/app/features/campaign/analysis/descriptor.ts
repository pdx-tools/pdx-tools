import type { DateComponents } from "@/features/timeline/date";
import type { FileVersion } from "../types";

/** The data that one save gives to campaign analysis. A game can add fields. */
export type SnapshotDescriptor = {
  /** Opaque. Use `snapshotId` to make it. */
  id: string;
  game: string;
  /** The exact campaign identity from the full parse. */
  campaignId: string;
  contentHash: string;
  /** The save date as `YYYY-MM-DD`. */
  date: string;
  /** The save date as `YYYYMMDD`, for sorting. */
  dateSort: number;
  gameVersion: string;
  /** Identifies the payload schema and its calculations. */
  extractorVersion: number;
  /** The kinds of data in the payload, such as "observations" or "map". */
  artifacts: readonly string[];
};

/** Equal content from the same extractor gives the same snapshot. */
export function snapshotId(game: string, extractorVersion: number, contentHash: string) {
  return `${game}:${extractorVersion}:${contentHash}`;
}

export function descriptorDate(descriptor: Pick<SnapshotDescriptor, "dateSort">): DateComponents {
  const { dateSort } = descriptor;
  return {
    year: Math.floor(dateSort / 10000),
    month: Math.floor(dateSort / 100) % 100,
    day: dateSort % 100,
  };
}

/** Date order. Snapshots on the same date have a stable order. */
export function compareDescriptors(a: SnapshotDescriptor, b: SnapshotDescriptor) {
  return a.dateSort - b.dateSort || a.id.localeCompare(b.id);
}

/**
 * Connects a local save entry to a snapshot. Several entries can refer to one
 * snapshot, so a renamed or duplicate file does not add an observation.
 */
export type SourceAssociation = { snapshotId: string; version: FileVersion };
