import { describe, expect, it } from "vitest";
import { rankFormatter } from "./ModeRanking";
import type { Ranking } from "./ModeRanking";

const ranking = (over: Partial<Ranking>): Ranking => ({
  noun: "Countries",
  unit: "",
  rows: [{ key: 1, name: "A", color: "", value: 0.967 }],
  ...over,
});

// The headline and the first row call this one function, so they read the same.
describe("rankFormatter", () => {
  it("writes control as a percent, as the list does", () => {
    expect(rankFormatter(ranking({}), "control")(0.967)).toBe("96.7%");
  });

  it("writes growth with its sign and rate", () => {
    expect(rankFormatter(ranking({}), "populationGrowth")(0.0354)).toContain("3.54%");
  });

  it("writes a column in one unit from its largest value", () => {
    const format = (v: number) => `${v} raw`;
    const rows = [{ key: 1, name: "A", color: "", value: 4872 }];
    expect(rankFormatter(ranking({ rows, format }), "development")(4872)).toBe("4872 raw");
  });
});
