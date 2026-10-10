import { describe, expect, it } from "vitest";
import { exportSnapshots } from "./exportSnapshots";
import type { Snapshot } from "./types";

describe("observation JSON export", () => {
  it("preserves breakdown values and declares the observation schema", () => {
    const snapshot = {
      schemaVersion: 3,
      hash: "blake3:source",
      countries: [
        {
          tag: "FRA",
          religions: new Map([["catholic", 1200]]),
          materials: new Map([["grain", 3.5]]),
          buildings: new Map([["farm", 2]]),
        },
      ],
    } as unknown as Snapshot;
    const output = JSON.parse(exportSnapshots([snapshot]));
    expect(output.schemaVersion).toBe(3);
    expect(output.snapshots[0].countries[0]).toEqual({
      tag: "FRA",
      religions: { catholic: 1200 },
      materials: { grain: 3.5 },
      buildings: { farm: 2 },
    });
    expect(snapshot.countries[0].religions.get("catholic")).toBe(1200);
  });
});
