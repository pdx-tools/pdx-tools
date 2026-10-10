import type { Snapshot } from "./types";

/** JSON cannot encode the Maps used by the in-memory observation schema. */
export function exportSnapshots(snapshots: Snapshot[]): string {
  return JSON.stringify({ schemaVersion: 3, snapshots }, (_key, value) =>
    value instanceof Map ? Object.fromEntries(value) : value,
  );
}
