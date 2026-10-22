import { createAnalysisWorker } from "@/features/campaign/analysis/workerClient";
import type { Eu4AnalysisStore } from "@/wasm/wasm_eu4";
import type { Eu4Queries } from "./analysisQueries";
import type { Eu4Payload, Eu4SnapshotDescriptor } from "./analysisTypes";

/** The EU4 analysis session of this tab. */
export const eu4Analysis = createAnalysisWorker<
  Eu4SnapshotDescriptor,
  Eu4Payload,
  Eu4AnalysisStore,
  Eu4Queries
>({
  session: "eu4",
  start: () => new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" }),
  // No UI keeps EU4 analysis state yet. A new worker starts on the next call.
  onFailure: () => {},
});
