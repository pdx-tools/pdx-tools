import wasmModule from "../wasm/wasm_app_bg.wasm";
import {
  initSync,
  achievements,
  eu4_days_to_date,
  latest_eu4_minor_patch,
} from "../wasm/wasm_app";
import type { Achievement } from "../wasm/wasm_app";

initSync({ module: wasmModule });

const withWasm = <T extends Array<unknown>, U>(fn: (...args: T) => U) => {
  return (...args: T): U => {
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
