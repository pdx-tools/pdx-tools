import { useMemo } from "react";
import { useCampaignNavigation } from "@/features/campaign/CampaignProvider";
import { isAnalysisPaused } from "@/features/campaign/analysis/analysisState";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import { useEu4FileVersion, useEu4Meta } from "@/features/eu4/store";
import { sameFileVersion } from "@/features/campaign/types";
import { analyzeEu4Saves } from "@/features/eu4/analysis/analyzeSaves";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import {
  analysisSaves,
  pendingEntries,
  pendingUploads,
} from "@/features/eu4/analysis/campaignSaves";
import { useEu4History } from "@/features/eu4/analysis/store";

/** The open campaign, the saves that analysis reads and what analysis has of them. */
export function useEu4Campaign() {
  const nav = useCampaignNavigation();
  const playthroughId = useEu4Meta().playthroughId;
  const entries = localSaveRegistry.useEntries();
  const snapshots = useEu4History((state) => state.snapshots);
  const sources = useEu4History((state) => state.sources);
  const failedSources = useEu4History((state) => state.failedSources);
  const analyzingEntryIds = useEu4History((state) => state.analyzingEntryIds);
  const uploads = useEu4History((state) => state.uploads);
  const analyzingUploadIds = useEu4History((state) => state.analyzingUploadIds);
  const progress = useEu4History((state) => state.progress);
  const issues = useEu4History((state) => state.issues);
  const cancel = useEu4History((state) => state.cancel);
  const paused = useEu4History((state) => isAnalysisPaused(state, playthroughId));
  const enabled = useEu4History(
    (state) => !!playthroughId && state.analysisEnabledCampaigns.includes(playthroughId),
  );
  const saves = useMemo(
    () =>
      analysisSaves(
        nav?.saves ?? [],
        {
          snapshots: snapshots.filter((snapshot) => snapshot.campaignId === playthroughId),
          sources,
          failedSources,
          analyzingEntryIds,
          uploads,
          analyzingUploadIds,
        },
        entries,
      ),
    [
      nav?.saves,
      snapshots,
      sources,
      failedSources,
      analyzingEntryIds,
      uploads,
      analyzingUploadIds,
      playthroughId,
      entries,
    ],
  );
  /** Analyze each save without a snapshot, and download the uploads among them. */
  const analyze = () => {
    if (!playthroughId) return;
    const history = useEu4History.getState();
    const listed = nav?.saves ?? [];
    const uploads = pendingUploads(listed, history);
    const local = pendingEntries(listed, history).slice(0, 1000 - uploads.length);
    if (local.length || uploads.length)
      void analyzeEu4Saves(listed, playthroughId, local, uploads).catch((error) =>
        useEu4History.setState({ issues: [String(error)] }),
      );
    history.enableAnalysis(playthroughId);
  };
  // The marker needs the snapshot of the bytes that the viewer parsed.
  const fileVersion = useEu4FileVersion();
  const openSave = saves.find((x) => x.save.isOpen && x.snapshot) ?? null;
  const source =
    openSave?.save.source.kind === "local" && openSave.save.source.entryId
      ? sources[openSave.save.source.entryId]
      : null;
  const sameBytes =
    openSave?.save.source.kind === "upload" ||
    (!!source && !!fileVersion && sameFileVersion(source.version, fileVersion));
  const open = openSave && sameBytes ? openSave : null;
  /**
   * True when the file of a local dot no longer holds the bytes that analysis
   * read, such as a save that the game wrote again on the same date. The
   * registry then reads the new version, and analysis reads it again.
   */
  const fileChanged = async (save: AnalysisSave): Promise<boolean> => {
    const entryId = save.save.source.kind === "local" ? save.save.source.entryId : null;
    const entry = entryId ? localSaveRegistry.get(entryId) : undefined;
    const read = entry ? useEu4History.getState().sources[entry.id] : undefined;
    // A held file cannot change; a reader of a changed one fails.
    if (!entry || !read || entry.ref.kind !== "handle") return false;
    const file = await entry.ref.file.getFile().catch(() => null);
    // Opening reports a missing file.
    if (!file || sameFileVersion(file, read.version)) return false;
    await localSaveRegistry.verify(entry.id);
    return true;
  };
  const waitingUploads = saves.filter(
    (x) => x.save.source.kind === "upload" && x.status === "pending",
  ).length;
  return {
    nav,
    playthroughId,
    saves,
    /** The open save, when its snapshot is of the bytes that the viewer parsed. */
    open,
    /** True when the open save has a snapshot of other bytes than the viewer parsed. */
    openOtherVersion: !!openSave && !sameBytes,
    enabled,
    paused,
    progress,
    issues,
    waitingUploads,
    stop: () => cancel?.(),
    analyze,
    fileChanged,
  };
}

export type Eu4Campaign = ReturnType<typeof useEu4Campaign>;
