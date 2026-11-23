import { IMPORT_BUSY_ERROR, analysisAdmission } from "@/features/campaign/analysis/admission";
import type { CampaignUpload } from "@/features/campaign/analysis/analyzeCampaign";
import { isAnalysisPaused } from "@/features/campaign/analysis/analysisState";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { ChartedSave } from "@/features/campaign/types";
import { analyzeEu4Campaign } from "./analyzeCampaign";
import { eu4Analysis } from "./analysisClient";
import { pendingUploads, replacedSnapshots } from "./campaignSaves";
import { useEu4History } from "./store";

/**
 * Analyze saves of the campaign list. A snapshot of a date whose save the
 * list replaced goes first, so the new save of that date can take its place.
 */
export async function importEu4Saves(
  saves: readonly ChartedSave[],
  playthroughId: string,
  entries: LocalSaveEntry[],
  uploads: readonly CampaignUpload[] = [],
) {
  const replaced = replacedSnapshots(saves, useEu4History.getState());
  await analyzeEu4Campaign(entries, playthroughId, uploads, replaced);
}

/**
 * Download and read the campaign's uploads that are not read yet. When another
 * import runs, such as the local saves or a watched write, this waits for it to
 * end. It then gives up if the campaign changed or was paused in the meantime.
 */
export async function readEu4Uploads(saves: readonly ChartedSave[], playthroughId: string) {
  const session = eu4Analysis.signal();
  for (;;) {
    const uploads = pendingUploads(saves, useEu4History.getState());
    if (!uploads.length) return;
    try {
      return await importEu4Saves(saves, playthroughId, [], uploads);
    } catch (error) {
      if (!(error instanceof Error && error.name === IMPORT_BUSY_ERROR)) throw error;
      await analysisAdmission().idle();
      if (session.aborted || isAnalysisPaused(useEu4History.getState(), playthroughId)) return;
    }
  }
}
