import { analysisSessionHandlers } from "@/features/campaign/analysis/analysisState";
import { createAnalysisWorker } from "@/features/campaign/analysis/workerClient";
import type { Eu4AnalysisStore } from "@/wasm/wasm_eu4";
import { useEu4History } from "./store";

/** The EU4 analysis session of this tab. */
export const eu4Analysis = createAnalysisWorker<Eu4AnalysisStore>({
  session: "eu4",
  start: () => new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" }),
  ...analysisSessionHandlers(useEu4History),
});
