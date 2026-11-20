import { campaignAnalyzer } from "@/features/campaign/analysis/analyzeCampaign";
import { eu5Analysis } from "./analysisClient";
import { eu5ParserAdapter } from "./parserAdapter";
import { useHistory } from "./store";

/** Analyze local campaign entries without opening a save or controlling navigation. */
export const analyzeCampaign = campaignAnalyzer({
  history: useHistory,
  analysis: eu5Analysis,
  parser: eu5ParserAdapter,
});
