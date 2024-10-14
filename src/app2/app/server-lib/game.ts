import path from "path";
import fs from "fs";
import {
  initSync,
  achievements,
  eu4_days_to_date,
  latest_eu4_minor_patch,
  type Achievement,
} from "./wasm/wasm_app";

function compileWasm() {
  // https://vercel.com/docs/concepts/functions/serverless-functions/runtimes#including-additional-files
  const file = path.join(
    process.cwd(),
    "src",
    "server-lib",
    "wasm",
    "wasm_app_bg.wasm",
  );
  initSync(fs.readFileSync(file));
}

let hasInit = false;
const withWasm = <T extends Array<any>, U>(fn: (...args: T) => U) => {
  return (...args: T): U => {
    if (!hasInit) {
      hasInit = true;
      compileWasm();
    }

    return fn(...args);
  };
};

let achMemo: Achievement[] | undefined;
export const loadAchievements = withWasm(
  () => achMemo ?? (achMemo = achievements()),
);
export const getAchievement = withWasm((id: number) =>
  loadAchievements().find((x) => x.id == id),
);
export const eu4DaysToDate = withWasm((days: number) => eu4_days_to_date(days));
export const latestEu4MinorPatch = withWasm(() => latest_eu4_minor_patch());
