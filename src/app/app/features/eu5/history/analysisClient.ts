import { analysisSessionHandlers } from "@/features/campaign/analysis/analysisState";
import { createFrameAnalysisWorker } from "@/features/campaign/analysis/workerClient";
import type { Eu5AnalysisStore } from "@/wasm/wasm_eu5";
import { useHistory } from "./store";

/** The EU5 analysis session of this tab. */
export const eu5Analysis = createFrameAnalysisWorker<Eu5AnalysisStore>({
  session: "eu5",
  start: () => new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" }),
  ...analysisSessionHandlers(useHistory),
});

export const connectAnalysisFrames = eu5Analysis.connectFrames;
