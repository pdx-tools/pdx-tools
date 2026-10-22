import { expose } from "comlink";
import { sessionApi } from "@/features/campaign/analysis/session";
import init, { Eu4AnalysisStore } from "@/wasm/wasm_eu4";
import wasmUrl from "@/wasm/wasm_eu4_bg.wasm?url";
import { eu4Queries } from "./analysisQueries";
import type { Eu4Payload, Eu4SnapshotDescriptor } from "./analysisTypes";

let memory: WebAssembly.Memory | undefined;
const store = init({ module_or_path: wasmUrl }).then((wasm) => {
  memory = wasm.memory;
  return new Eu4AnalysisStore();
});
export const analysisApi = sessionApi<
  Eu4SnapshotDescriptor,
  Eu4Payload,
  Eu4AnalysisStore,
  typeof eu4Queries
>(store, eu4Queries, () => memory?.buffer.byteLength ?? 0);
expose(analysisApi);
