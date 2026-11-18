import { describe, expect, it } from "vitest";
import type { ConcentrationPoint } from "@/wasm/wasm_eu5";
import { concentrationReading } from "./ConcentrationCurve";

const points = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => ({ locationRank: i + 1, share: (i + 1) / n }) as ConcentrationPoint,
  );

describe("concentrationReading", () => {
  it("reads the top tenth of the locations", () => {
    expect(concentrationReading(points(100))).toEqual({ rank: 10, count: 100, share: 0.1 });
  });

  it("reads the top location of a short list", () => {
    expect(concentrationReading(points(4))).toEqual({ rank: 1, count: 4, share: 0.25 });
  });

  it("has no reading with no points", () => {
    expect(concentrationReading([])).toBeNull();
  });
});
