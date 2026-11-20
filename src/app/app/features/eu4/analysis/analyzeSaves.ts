import { IMPORT_BUSY_ERROR } from "@/features/campaign/analysis/admission";
import type { CampaignUpload } from "@/features/campaign/analysis/analyzeCampaign";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { CampaignSave } from "@/features/campaign/types";
import { analyzeEu4Campaign } from "./analyzeCampaign";
import { replacedSnapshots } from "./campaignSaves";
import { useEu4History } from "./store";

/**
 * Analyze saves of the campaign list. A snapshot of a date whose save the
 * list replaced goes first, so the new save of that date can take its place.
 */
export async function analyzeEu4Saves(
  saves: readonly CampaignSave[],
  playthroughId: string,
  entries: LocalSaveEntry[],
  uploads: readonly CampaignUpload[] = [],
) {
  const replaced = replacedSnapshots(saves, useEu4History.getState());
  try {
    await analyzeEu4Campaign(entries, playthroughId, uploads, replaced);
  } catch (error) {
    // Another analysis runs, and it reads these saves too.
    if (error instanceof Error && error.name === IMPORT_BUSY_ERROR) return;
    throw error;
  }
}
