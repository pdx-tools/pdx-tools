import { describe, expect, it } from "vitest";
import { exportSnapshots } from "./exportSnapshots";
import type { Snapshot } from "./types";

describe("observation JSON export", () => {
  it("preserves breakdown values and declares the observation schema", async () => {
    const snapshot = {
      hash: "eu5:source",
      countries: [
        {
          tag: "FRA",
          religions: new Map([["catholic", 1200]]),
          materials: new Map([["grain", 3.5]]),
          buildings: new Map([["farm", 2]]),
        },
      ],
    } as unknown as Snapshot;
    const output = JSON.parse(await exportSnapshots([snapshot]).text());
    expect(output.snapshots[0].countries[0]).toEqual({
      tag: "FRA",
      religions: { catholic: 1200 },
      materials: { grain: 3.5 },
      buildings: { farm: 2 },
    });
    expect(snapshot.countries[0].religions.get("catholic")).toBe(1200);
  });
  it("preserves observation order across chunks and exports an empty campaign", async () => {
    const snapshots = [{ hash: "first" }, { hash: "second" }] as Snapshot[];
    expect(JSON.parse(await exportSnapshots(snapshots).text()).snapshots).toEqual(snapshots);
    expect(JSON.parse(await exportSnapshots([]).text())).toEqual({
      snapshots: [],
    });
    expect(exportSnapshots([]).type).toBe("application/json");
  });
});
