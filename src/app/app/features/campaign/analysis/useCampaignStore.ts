import { useEffect } from "react";
import { captureException } from "@/lib/captureException";
import { IMPORT_BUSY_ERROR, analysisAdmission } from "./admission";
import { isAnalysisPaused } from "./analysisState";
import type { AnalysisHistory, CampaignStoreStatus } from "./analysisState";
import type { SnapshotDescriptor } from "./descriptor";
import { markKept, mergeRestored, persistRequest } from "./campaignStore";
import { STALE_GENERATION_ERROR } from "./session";
import type { AnalysisStore, DescriptorOf } from "./session";
import type { StoringAnalysisWorkerClient } from "./workerClient";

/** A release of the session or a new generation ends a call; that is not an error. */
function report(error: unknown) {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "AbortError" || name === STALE_GENERATION_ERROR) return;
  captureException(error, { tags: { msg: "campaign-store" } });
}

/** Whether this browser keeps a folder of the campaign, without starting a worker. */
async function keptFolder(campaignId: string): Promise<"found" | "none" | "unavailable"> {
  let root: FileSystemDirectoryHandle;
  try {
    root = await navigator.storage.getDirectory();
  } catch {
    return "unavailable";
  }
  try {
    const campaigns = await root.getDirectoryHandle("campaigns");
    await campaigns.getDirectoryHandle(encodeURIComponent(campaignId));
    return "found";
  } catch (error) {
    // Any other failure is for the worker's load to judge.
    return error instanceof DOMException && error.name === "NotFoundError" ? "none" : "found";
  }
}

/** The import lease, once no other import holds it. */
async function importLease() {
  for (;;) {
    try {
      return analysisAdmission().acquireImport();
    } catch (error) {
      if (!(error instanceof Error && error.name === IMPORT_BUSY_ERROR)) throw error;
      await analysisAdmission().idle();
    }
  }
}

/** Ask the browser once to keep this site's files, as it may clear them otherwise. */
let durable: Promise<boolean> | null = null;
const keepDurable = () => (durable ??= navigator.storage.persist().catch(() => false));

const setStatus = <D extends SnapshotDescriptor>(
  history: AnalysisHistory<D>,
  campaignId: string,
  status: Partial<CampaignStoreStatus>,
) =>
  history.setState((state) =>
    state.stored?.campaignId === campaignId ? { stored: { ...state.stored, ...status } } : state,
  );

/**
 * Keep the points of the open campaign in this browser between visits.
 * They come back when the campaign opens, as saves with figures only, and
 * each change is written after a short pause. Nothing is written before the
 * kept points were read, or after they could not be read.
 */
export function useCampaignStore<S extends AnalysisStore>({
  history,
  analysis,
  playthroughId,
}: {
  history: AnalysisHistory<DescriptorOf<S>>;
  analysis: StoringAnalysisWorkerClient<S>;
  playthroughId: string | null;
}) {
  useEffect(() => {
    if (!playthroughId) return;
    const campaignId = playthroughId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let writing = false;
    let again = false;
    const ready = () => {
      const state = history.getState().stored?.state;
      return restored() && (state === "ready" || state === "full");
    };
    /** What to write now, or null while there is nothing to keep, so no worker starts for it. */
    const request = () => {
      const state = history.getState();
      const next = persistRequest(state, campaignId);
      const before = state.stored;
      return next.points.length || before?.kept || before?.missing ? next : null;
    };
    const write = async () => {
      if (writing) {
        again = true;
        return;
      }
      writing = true;
      try {
        do {
          again = false;
          const next = request();
          if (cancelled || !ready() || !next) return;
          const reply = await analysis.persist(campaignId, next);
          if (reply.status === "readOnly")
            return setStatus(history, campaignId, { state: "unreadable" });
          setStatus(history, campaignId, {
            state: reply.status === "full" ? "full" : "ready",
            kept: reply.kept,
            missing: reply.missing,
          });
          // A written point stays until Forget, also when its file moves on.
          history.setState((state) => {
            const points = markKept(state.points, reply.ids);
            return points === state.points ? state : { points };
          });
          // Firefox asks the player, and the answer can take any time.
          if (reply.kept > 0) void keepDurable();
        } while (again);
      } catch (error) {
        report(error);
      } finally {
        writing = false;
      }
    };

    // A failed or released worker drops the restored points, so they are read
    // again once the campaign is not paused.
    let restoring = false;
    let failedIn: number | null = null;
    const restored = () => {
      const { stored } = history.getState();
      return stored?.campaignId === campaignId && stored.generation === analysis.generation();
    };
    const restoreWhenNeeded = () => {
      if (cancelled || restoring || restored()) return;
      if (isAnalysisPaused(history.getState(), campaignId)) return;
      // A restore that failed waits for the next session.
      if (failedIn === analysis.generation()) return;
      restoring = true;
      // A failure moves the session to a new generation; one retry follows a resume.
      const started = analysis.generation();
      void restore()
        .catch((error: unknown) => {
          failedIn = started;
          report(error);
        })
        .finally(() => (restoring = false));
    };
    const unsubscribe = history.subscribe((state, before) => {
      if (state.stored !== before.stored || state.pausedCampaigns !== before.pausedCampaigns)
        restoreWhenNeeded();
      // After a Forget of an unreadable index, this visit's points are written anew.
      const writable = before.stored?.state === "unreadable" && state.stored?.state === "ready";
      if (
        !writable &&
        state.points === before.points &&
        state.sessions === before.sessions &&
        state.uploads === before.uploads
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void write();
      }, 1000);
    });

    const restore = async () => {
      const generation = analysis.generation();
      const found = await keptFolder(campaignId);
      // Nothing kept yet: no worker starts until there is a point to keep.
      if (found !== "found") {
        if (cancelled || generation !== analysis.generation()) return;
        if (isAnalysisPaused(history.getState(), campaignId)) return;
        const state = found === "none" ? "ready" : "unavailable";
        history.setState({
          stored: { campaignId, generation, state, missing: 0, kept: 0 },
        });
        return write();
      }
      analysis.claim(campaignId);
      const lease = await importLease();
      let result;
      try {
        result = await analysis.restore(campaignId, lease);
      } finally {
        lease.release();
      }
      const { reply } = result;
      if (cancelled || result.generation !== analysis.generation()) return;
      // A failure that paused the campaign meanwhile waits for a resume.
      if (isAnalysisPaused(history.getState(), campaignId)) return;
      if (reply.status === "ok") {
        history.setState((state) => ({
          ...mergeRestored(state, reply.content, reply.descriptors),
          // A paused campaign, such as after a failure, stays paused.
          ...(reply.descriptors.length && {
            analysisEnabledCampaigns: [...new Set([...state.analysisEnabledCampaigns, campaignId])],
          }),
        }));
      }
      history.setState({
        stored: {
          campaignId,
          generation: result.generation,
          state:
            reply.status === "unreadable"
              ? "unreadable"
              : reply.status === "ok" && reply.full
                ? "full"
                : "ready",
          missing: reply.status === "ok" ? reply.missing.length : 0,
          kept: reply.status === "ok" ? reply.content.points.length : 0,
        },
      });
      await write();
    };
    restoreWhenNeeded();

    return () => {
      cancelled = true;
      unsubscribe();
      // Close Save does not wait: a change of the last second is written now.
      if (timer !== undefined || again) {
        clearTimeout(timer);
        const next = request();
        if (ready() && next) void analysis.persist(campaignId, next).catch(report);
      }
    };
  }, [playthroughId, history, analysis]);
}

/**
 * Remove what this browser keeps of the campaign, and the points that no
 * open file or upload holds. The open files are kept again from now on.
 * Kept points that could not be read are only removed from the browser:
 * this visit's points stay, and are kept again.
 */
export async function forgetCampaign<S extends AnalysisStore>(
  history: AnalysisHistory<DescriptorOf<S>>,
  analysis: StoringAnalysisWorkerClient<S>,
  campaignId: string,
) {
  const lease = await importLease();
  try {
    await analysis.forget(campaignId);
    const state = history.getState();
    if (state.stored?.state === "unreadable") {
      setStatus(history, campaignId, { state: "ready", kept: 0, missing: 0 });
      return;
    }
    const held = new Set([
      ...Object.values(state.sources).map((x) => x.snapshotId),
      ...Object.values(state.uploads).flatMap((x) => (x.kind === "ready" ? [x.snapshotId] : [])),
    ]);
    const ids = state.snapshots
      .filter((x) => x.campaignId === campaignId && !held.has(x.id))
      .map((x) => x.id);
    await analysis.remove(ids);
    history.getState().forget(ids);
    setStatus(history, campaignId, { state: "ready", kept: 0, missing: 0 });
  } finally {
    lease.release();
  }
}
