import type { OverviewData } from "@/wasm/wasm_eu5";
import { expose } from "comlink";
import { CampaignAnalysisStore } from "./analysisStore";
import { serveMapFrames } from "./framePort";
import type { SaveAnalysis, HistoryQuery, AnalysisEntity } from "./analysisTypes";
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
  queryOverview: <K extends keyof OverviewData>(hash: string, key: K) =>
    store.queryOverview(hash, key),
  queryHistory: (query: HistoryQuery) => store.queryHistory(query),
  marketCenters: (campaignId: string, country: string) => store.marketCenters(campaignId, country),
  resolveEntity: (hash: string, entity: AnalysisEntity) => store.resolveEntity(hash, entity),
  exportObservations: (campaignId: string) => store.exportObservations(campaignId),
  clearCampaign: (campaignId?: string) => store.clearCampaign(campaignId),
  memoryBytes: () => store.memoryBytes(),
};
expose(analysisApi);
