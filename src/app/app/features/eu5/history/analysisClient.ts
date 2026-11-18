import { createFrameAnalysisWorker } from "@/features/campaign/analysis/workerClient";
import type { Eu5AnalysisStore } from "@/wasm/wasm_eu5";
import { useHistory } from "./store";

/** The EU5 analysis session of this tab. */
export const eu5Analysis = createFrameAnalysisWorker<Eu5AnalysisStore>({
  session: "eu5",
  start: () => new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" }),
  // The campaign stays paused, so it does not import again until the player resumes it.
  onFailure: (error, campaignId) => {
    const history = useHistory.getState();
    history.cancel?.();
    history.removeSnapshots();
    if (campaignId) history.pauseAnalysis(campaignId);
    useHistory.setState({ issues: [error.message] });
  },
  // Another campaign or game took the session. Its imports stop by themselves.
  onRelease: () => useHistory.getState().removeSnapshots(),
});

export const connectAnalysisFrames = eu5Analysis.connectFrames;
