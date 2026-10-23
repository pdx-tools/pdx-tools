import { createAnalysisWorker } from "@/features/campaign/analysis/workerClient";
import type { Eu4AnalysisStore } from "@/wasm/wasm_eu4";

/** The EU4 analysis session of this tab. */
export const eu4Analysis = createAnalysisWorker<Eu4AnalysisStore>({
  session: "eu4",
  start: () => new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" }),
  // No UI keeps EU4 analysis state yet. A new worker starts on the next call.
  onFailure: () => {},
});
