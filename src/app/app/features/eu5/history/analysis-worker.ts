import { expose } from "comlink";
import { analysisMemoryLimit, CampaignAnalysisStore } from "./analysisStore";
import type { CountryEntity } from "./analysisStore";
import { serveMapFrames } from "./framePort";
import type { SaveAnalysis } from "./analysisTypes";
const store = new CampaignAnalysisStore(
  analysisMemoryLimit((navigator as Navigator & { deviceMemory?: number }).deviceMemory),
);
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
  countryHistory: (campaignId: string, entity: CountryEntity) =>
    store.countryHistory(campaignId, entity),
  locationPopulation: (campaignId: string, locationIds: number[]) =>
    store.locationPopulation(campaignId, locationIds),
  marketHistory: (campaignId: string, good: string, centers: number[]) =>
    store.marketHistory(campaignId, good, centers),
  marketCatalog: (campaignId: string) => store.marketCatalog(campaignId),
  marketCenters: (campaignId: string, countryId: number) =>
    store.marketCenters(campaignId, countryId),
  exportObservations: (campaignId: string) => store.exportObservations(campaignId),
  clearCampaign: (campaignId?: string) => store.clearCampaign(campaignId),
  memoryBytes: () => store.memoryBytes(),
  memoryLimitBytes: () => store.memoryLimitBytes(),
};
expose(analysisApi);
