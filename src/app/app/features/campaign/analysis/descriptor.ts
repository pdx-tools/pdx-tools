import type { DateComponents } from "@/features/timeline/date";
import type { SnapshotDescriptor } from "@/wasm/wasm_eu5";
import type { FileVersion } from "../types";

// Each game module generates the same shared analysis types from the
// campaign-analysis crate.
export type { SnapshotDescriptor };

export function descriptorDate(descriptor: Pick<SnapshotDescriptor, "dateSort">): DateComponents {
  const { dateSort } = descriptor;
  const year = Math.floor(dateSort / 10000);
  // Month and day count up from the year, also before year 0.
  const rest = dateSort - year * 10000;
  return { year, month: Math.floor(rest / 100), day: rest % 100 };
}

/** The `dateSort` key of a date, by which a store keeps one snapshot for each date. */
export function dateSort(date: DateComponents): number {
  return date.year * 10000 + date.month * 100 + date.day;
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
