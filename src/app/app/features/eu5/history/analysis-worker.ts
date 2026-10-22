import { expose } from "comlink";
import { frameServer } from "@/features/campaign/analysis/framePort";
import { sessionApi } from "@/features/campaign/analysis/session";
import init, { Eu5AnalysisStore } from "@/wasm/wasm_eu5";
import wasmUrl from "@/wasm/wasm_eu5_bg.wasm?url";

const store = init({ module_or_path: wasmUrl }).then(() => new Eu5AnalysisStore());
export const analysisApi = {
  ...sessionApi(store),
  ...frameServer(async (id) => (await store).snapshot(id)),
};
expose(analysisApi);
