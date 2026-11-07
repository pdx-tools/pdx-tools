import { describe, expect, it } from "vitest";
import { rankLabel } from "./selection";

describe("rankLabel", () => {
  it("marks a rank that other countries share", () => {
    expect(rankLabel(1, 461)).toBe("=#1");
    expect(rankLabel(5)).toBe("#5");
    expect(rankLabel(5, 1)).toBe("#5");
  });
});
