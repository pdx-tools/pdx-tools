import { expose } from "comlink";
import { frameServer } from "@/features/campaign/analysis/framePort";
import { sessionApi } from "@/features/campaign/analysis/session";
import init, { Eu5AnalysisStore } from "@/wasm/wasm_eu5";
import wasmUrl from "@/wasm/wasm_eu5_bg.wasm?url";
import { eu5Queries } from "./analysisQueries";
import type { Eu5Payload, Eu5SnapshotDescriptor, MapFrame } from "./analysisTypes";

let memory: WebAssembly.Memory | undefined;
const store = init({ module_or_path: wasmUrl }).then((wasm) => {
  memory = wasm.memory;
  return new Eu5AnalysisStore();
});
export const analysisApi = {
  ...sessionApi<Eu5SnapshotDescriptor, Eu5Payload, Eu5AnalysisStore, typeof eu5Queries>(
    store,
    eu5Queries,
    () => memory?.buffer.byteLength ?? 0,
  ),
  ...frameServer(async (id): Promise<MapFrame> => (await store).frame(id)),
};
expose(analysisApi);
