import { expose } from "comlink";
import { frameServer } from "@/features/campaign/analysis/framePort";
import { residentMemoryLimit } from "@/features/campaign/analysis/residentStore";
import { Eu5CampaignAnalysis } from "./analysisStore";
import type { CountryEntity } from "./analysisStore";
import type { SaveAnalysis } from "./analysisTypes";

const analysis = new Eu5CampaignAnalysis(
  residentMemoryLimit((navigator as Navigator & { deviceMemory?: number }).deviceMemory),
);
export const analysisApi = {
  append: (save: SaveAnalysis) => analysis.append(save),
  ...frameServer((id) => analysis.mapFrame(id)),
  countryHistory: (campaignId: string, entity: CountryEntity) =>
    analysis.countryHistory(campaignId, entity),
  locationPopulation: (campaignId: string, locationIds: number[]) =>
    analysis.locationPopulation(campaignId, locationIds),
  marketHistory: (campaignId: string, good: string, centers: number[]) =>
    analysis.marketHistory(campaignId, good, centers),
  marketCatalog: (campaignId: string) => analysis.marketCatalog(campaignId),
  marketCenters: (campaignId: string, countryId: number) =>
    analysis.marketCenters(campaignId, countryId),
  exportObservations: (campaignId: string) => analysis.exportObservations(campaignId),
  clearCampaign: (campaignId?: string) => analysis.store.clear(campaignId),
  memory: () => analysis.store.memory(),
};
expose(analysisApi);
