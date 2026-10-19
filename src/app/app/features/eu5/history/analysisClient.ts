import { transfer } from "comlink";
import { createAnalysisWorker } from "@/features/campaign/analysis/workerClient";
import { collectBuffers } from "@/features/campaign/analysis/transferBuffers";
import type { analysisApi } from "./analysis-worker";
import type { SaveAnalysis } from "./analysisTypes";
import { useHistory } from "./store";

const worker = createAnalysisWorker<typeof analysisApi>({
  start: () => new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" }),
  onFailure: (error) => {
    useHistory.getState().cancel?.();
    const history = useHistory.getState();
    useHistory.setState({
      snapshots: [],
      sources: {},
      analysisPaused: true,
      analysisPausedCampaigns: [
        ...new Set([
          ...history.analysisPausedCampaigns,
          ...history.snapshots.map((snapshot) => snapshot.campaignId),
        ]),
      ],
      issues: [error.message],
      memoryFull: null,
    });
  },
});

export const campaignAnalysis = worker.remote;
export const connectAnalysisFrames = worker.connectFrames;

export function appendAnalysis(save: SaveAnalysis) {
  return campaignAnalysis().append(transfer(save, collectBuffers(save)));
}
