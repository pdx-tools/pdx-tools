import { GameDifficulty } from "@/services/appApi";
import { AchievementDifficulty } from "../services/appApi";
import { SortingFn } from "@tanstack/react-table";

export const difficultyText = (
  diff: AchievementDifficulty | GameDifficulty
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
  diff: AchievementDifficulty | GameDifficulty
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

export const difficultyColor = (diff: AchievementDifficulty): string => {
  switch (diff) {
    case "VeryEasy":
      return "bg-indigo-200";
    case "Easy":
      return "bg-blue-200";
    case "Medium":
      return "bg-green-100";
    case "Hard":
      return "bg-yellow-100";
    case "VeryHard":
      return "bg-orange-100";
    case "Insane":
      return "bg-red-100";
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
