import { analysisAdmission } from "@/features/campaign/analysis/admission";
import { importBatch } from "@/features/campaign/analysis/importScheduler";
import type { ImportOptions } from "@/features/campaign/analysis/importScheduler";
import { eu4Analysis } from "./analysisClient";
import type { Eu4SnapshotDescriptor } from "./analysisTypes";
import { eu4ParserAdapter } from "./parserAdapter";

export type Eu4ImportOptions = Partial<
  Pick<ImportOptions<Eu4SnapshotDescriptor>, "onFileComplete" | "onProgress">
> & { signal?: AbortSignal };

/**
 * Analyze EU4 saves of one campaign. The campaign is the playthrough ID of
 * a full parse, such as the open save. A save of another campaign fails
 * after its parse and the session does not keep it.
 */
export async function importEu4Campaign(
  files: readonly File[],
  playthroughId: string,
  {
    signal = new AbortController().signal,
    onFileComplete = () => {},
    ...options
  }: Eu4ImportOptions = {},
) {
  // One import runs in the tab, for all games.
  const lease = analysisAdmission().acquireImport();
  try {
    eu4Analysis.claim(playthroughId);
    return await importBatch(files, eu4ParserAdapter, eu4Analysis, {
      ...options,
      signal,
      lease,
      onFileComplete,
      refuseOutput: ({ descriptor }) =>
        descriptor.campaignId === playthroughId
          ? null
          : "belongs to another campaign; not analyzed with this campaign.",
    });
  } finally {
    lease.release();
  }
}
