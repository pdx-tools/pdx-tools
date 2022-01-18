import { GameDifficulty } from "@/services/rakalyApi";
import { AchievementDifficulty } from "../services/rakalyApi";

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
      return "#d8d8ff";
    case "Easy":
      return "#d8e8f0";
    case "Medium":
      return "#d8fcde";
    case "Hard":
      return "#fbfbd8";
    case "VeryHard":
      return "#f0e8d8";
    case "Insane":
      return "#ffd8d8";
  }
};

interface DiffProp {
  difficulty: AchievementDifficulty | GameDifficulty;
}

export const difficultyComparator = (a: DiffProp, b: DiffProp): number => {
  return difficultyNum(a.difficulty) - difficultyNum(b.difficulty);
};
