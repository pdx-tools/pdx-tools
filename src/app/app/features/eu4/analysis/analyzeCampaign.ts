import { campaignAnalyzer } from "@/features/campaign/analysis/analyzeCampaign";
import { fetchOk } from "@/lib/fetch";
import { eu4Analysis } from "./analysisClient";
import { eu4ParserAdapter } from "./parserAdapter";
import { useEu4History } from "./store";

/** Analyze local campaign entries, then uploads, without opening a save or controlling navigation. */
export const analyzeEu4Campaign = campaignAnalyzer({
  history: useEu4History,
  analysis: eu4Analysis,
  parser: eu4ParserAdapter,
  download: (saveId, signal) =>
    fetchOk(`/api/saves/${encodeURIComponent(saveId)}/file`, { signal }).then((x) => x.blob()),
});
