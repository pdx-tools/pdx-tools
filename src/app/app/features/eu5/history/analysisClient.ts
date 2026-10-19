import { transfer } from "comlink";
import { createAnalysisWorker } from "@/features/campaign/analysis/workerClient";
import type { AnalysisSink } from "@/features/campaign/analysis/importScheduler";
import { collectBuffers } from "@/features/campaign/analysis/transferBuffers";
import type { analysisApi } from "./analysis-worker";
import type { Eu5SnapshotDescriptor, SaveAnalysis } from "./analysisTypes";
import { useHistory } from "./store";

const worker = createAnalysisWorker<typeof analysisApi>({
  session: "eu5",
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
export const analysisGeneration = worker.generation;
export const clearAnalysis = worker.clear;
export const connectAnalysisFrames = worker.connectFrames;

/** Where the import scheduler stores EU5 parser output. */
export const eu5AnalysisSink: AnalysisSink<SaveAnalysis, Eu5SnapshotDescriptor> = {
  generation: worker.generation,
  append: (generation, save) =>
    campaignAnalysis().append(generation, transfer(save, collectBuffers(save))),
  refreshResident: worker.refreshResident,
};
