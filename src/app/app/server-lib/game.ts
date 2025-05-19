import init, {
  initSync,
  achievements,
  eu4_days_to_date,
  latest_eu4_minor_patch,
  type Achievement,
} from "./wasm/wasm_app";

// detect if on cloudflare to import the Wasm.Module directly
if (typeof WebSocketPair !== "undefined") {
  const wasmApp = await import("wasm_app_bg.wasm");
  initSync({ module: wasmApp.default });
} else {
  const wasmUrl = await import("./wasm/wasm_app_bg.wasm?url");
  const url = `.${wasmUrl.default}`;
  const fs = await import("node:fs/promises");
  const data = await fs.readFile(url);
  await init({ module_or_path: data });
}

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
