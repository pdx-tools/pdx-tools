import { difficultyNum, difficultyText } from "@/lib/difficulty";

test("difficulty text", () => {
  expect(difficultyText("VeryEasy")).toBe("Very Easy");
  expect(difficultyText("VeryHard")).toBe("Very Hard");
  expect(difficultyText("Easy")).toBe("Easy");
});

test("difficulty number", () => {
  expect(difficultyNum("VeryEasy")).toBeLessThan(difficultyNum("Easy"));
  expect(difficultyNum("Easy")).toBeLessThan(difficultyNum("Medium"));
  expect(difficultyNum("Hard")).toBeLessThan(difficultyNum("VeryHard"));
  expect(difficultyNum("VeryHard")).toBeLessThan(difficultyNum("Insane"));
});
