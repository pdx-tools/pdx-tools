import { expose } from "comlink";
import { sessionApi } from "@/features/campaign/analysis/session";
import init, { Eu4AnalysisStore } from "@/wasm/wasm_eu4";
import wasmUrl from "@/wasm/wasm_eu4_bg.wasm?url";

const store = init({ module_or_path: wasmUrl }).then(() => new Eu4AnalysisStore());
export const analysisApi = sessionApi(store);
expose(analysisApi);
