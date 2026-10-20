import type { OverviewData } from "@/wasm/wasm_eu5";
import { expose } from "comlink";
import { frameServer } from "@/features/campaign/analysis/framePort";
import { residentMemoryLimit } from "@/features/campaign/analysis/residentStore";
import { Eu5CampaignAnalysis } from "./analysisStore";
import type { AnalysisEntity, HistoryQuery, SaveAnalysis } from "./analysisTypes";

const analysis = new Eu5CampaignAnalysis(
  residentMemoryLimit((navigator as Navigator & { deviceMemory?: number }).deviceMemory),
);
export const analysisApi = {
  append: (save: SaveAnalysis) => analysis.append(save),
  queryOverview: <K extends keyof OverviewData>(id: string, key: K) =>
    analysis.queryOverview(id, key),
  queryHistory: (query: HistoryQuery) => analysis.queryHistory(query),
  marketCenters: (campaignId: string, country: string) =>
    analysis.marketCenters(campaignId, country),
  resolveEntity: (id: string, entity: AnalysisEntity) => analysis.resolveEntity(id, entity),
  exportObservations: (campaignId: string) => analysis.exportObservations(campaignId),
  ...frameServer((id) => analysis.mapFrame(id)),
  clearCampaign: (campaignId?: string) => analysis.store.clear(campaignId),
  memory: () => analysis.store.memory(),
};
expose(analysisApi);
