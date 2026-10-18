import { expose } from "comlink";
import { CampaignAnalysisStore } from "./analysisStore";
import { serveMapFrames } from "./framePort";
import type { SaveAnalysis } from "./analysisTypes";
const store = new CampaignAnalysisStore();
const readers = new Map<string, () => void>();
export const analysisApi = {
  append: (save: SaveAnalysis) => store.append(save),
  connectFrames: (id: string, port: MessagePort) => {
    readers.get(id)?.();
    readers.set(
      id,
      serveMapFrames(port, (hash) => store.mapFrame(hash)),
    );
  },
  disconnectFrames: (id: string) => {
    readers.get(id)?.();
    readers.delete(id);
  },
  clearCampaign: (campaignId?: string) => store.clearCampaign(campaignId),
  memoryBytes: () => store.memoryBytes(),
};
expose(analysisApi);
