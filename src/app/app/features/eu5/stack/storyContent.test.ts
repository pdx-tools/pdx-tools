import { describe, expect, it } from "vitest";
import { pastStoryRows, rowWithPlayer } from "./storyContent";

describe("a story image of a past date", () => {
  it("has the land of that date in its rows, and no figure of the save", () => {
    const rows = pastStoryRows([
      { name: "Milan", colorHex: "#8060c0", locations: 29, score: 51 } as never,
    ]);
    expect(rows).toEqual([{ name: "Milan", color: "#8060c0", shown: "29" }]);
  });
});

describe("a story image of a group", () => {
  it("names each player", () => {
    expect(rowWithPlayer("England", "Jaremir")).toBe("England (Jaremir)");
    expect(rowWithPlayer("Rome", undefined)).toBe("Rome");
  });
});
