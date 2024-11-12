import { difficultyNum, difficultyText } from "@/lib/difficulty";
import { describe, expect, test } from "vitest";

describe("difficulty", () => {
  test.for([
    ["VeryEasy", "Very Easy"],
    ["VeryHard", "Very Hard"],
    ["Easy", "Easy"],
  ] as const)("difficultyText(%s) -> %s", ([input, expected]) => {
    expect(difficultyText(input)).toBe(expected);
  });

  test.for([
    ["VeryEasy", "Easy"],
    ["Easy", "Medium"],
    ["Hard", "VeryHard"],
    ["VeryHard", "Insane"],
  ] as const)("difficultyNum(%s) < %s", ([a1, a2]) => {
    expect(difficultyNum(a1)).toBeLessThan(difficultyNum(a2));
  });
});
