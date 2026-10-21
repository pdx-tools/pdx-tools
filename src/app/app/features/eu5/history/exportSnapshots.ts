import type { Snapshot } from "./types";

/** Serialize each observation separately so large campaigns don't hit the JS string limit. */
export function exportSnapshots(snapshots: Snapshot[]): Blob {
  const parts: BlobPart[] = ['{"snapshots":['];
  for (const [index, snapshot] of snapshots.entries()) {
    if (index) parts.push(",");
    // Blob concatenation retains byte chunks without creating one campaign-sized string.
    parts.push(
      new Blob([
        JSON.stringify(snapshot, (_key, value) =>
          value instanceof Map ? Object.fromEntries(value) : value,
        ),
      ]),
    );
  }
  parts.push("]}");
  return new Blob(parts, { type: "application/json" });
}
