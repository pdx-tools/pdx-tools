import { expose } from "comlink";
import { frameServer } from "@/features/campaign/analysis/framePort";
import { residentMemoryLimit } from "@/features/campaign/analysis/residentStore";
import { Eu5CampaignAnalysis } from "./analysisStore";
import type { SaveAnalysis } from "./analysisTypes";

const analysis = new Eu5CampaignAnalysis(
  residentMemoryLimit((navigator as Navigator & { deviceMemory?: number }).deviceMemory),
);
export const analysisApi = {
  append: (save: SaveAnalysis) => analysis.append(save),
  ...frameServer((id) => analysis.mapFrame(id)),
  clearCampaign: (campaignId?: string) => analysis.store.clear(campaignId),
  memory: () => analysis.store.memory(),
};
expose(analysisApi);
