import { GameDifficulty } from "@/services/appApi";
import { AchievementDifficulty } from "../services/appApi";
import { SortingFn } from "@tanstack/react-table";

export const difficultyText = (
  diff: AchievementDifficulty | GameDifficulty,
): string => {
  switch (diff) {
    case "VeryEasy":
      return "Very Easy";
    case "VeryHard":
      return "Very Hard";
    default:
      return diff;
  }
};

export const difficultyNum = (
  diff: AchievementDifficulty | GameDifficulty,
): number => {
  switch (diff) {
    case "VeryEasy":
      return 0;
    case "Easy":
      return 1;
    case "Normal":
    case "Medium":
      return 2;
    case "Hard":
      return 3;
    case "VeryHard":
      return 4;
    case "Insane":
      return 5;
  }
};

export const difficultyColor = (diff: GameDifficulty): string | undefined => {
  switch (diff) {
    case "Easy":
    case "VeryEasy":
      return "text-emerald-500";
    case "Hard":
    case "VeryHard":
      return "text-rose-500";
    default:
      return undefined;
  }
};

interface DiffProp {
  difficulty: AchievementDifficulty | GameDifficulty;
}

export const difficultyComparator = (a: DiffProp, b: DiffProp): number => {
  return difficultyNum(a.difficulty) - difficultyNum(b.difficulty);
};

export const difficultySort: SortingFn<any> = (rowA, rowB, columnId) =>
  difficultyNum(rowA.getValue(columnId)) -
  difficultyNum(rowB.getValue(columnId));
