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
  download: async ({ saveId, name }, signal) => {
    const response = await fetchOk(`/api/saves/${encodeURIComponent(saveId)}/file`, { signal });
    // A renamed upload keeps its bytes, so the parser gets an EU4 file name.
    const fileName = eu4ParserAdapter.refuse(new File([], name)) ? `${name}.eu4` : name;
    return new File([await response.blob()], fileName);
  },
});
