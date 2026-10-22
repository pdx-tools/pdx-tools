import { createAnalysisWorker } from "@/features/campaign/analysis/workerClient";
import type { Eu5Payload, Eu5SnapshotDescriptor } from "./analysisTypes";
import { useHistory } from "./store";

/** The EU5 analysis session of this tab. */
export const eu5Analysis = createAnalysisWorker<Eu5SnapshotDescriptor, Eu5Payload>({
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
    });
  },
});

export const connectAnalysisFrames = eu5Analysis.connectFrames;
