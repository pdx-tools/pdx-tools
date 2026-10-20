import { descriptorDate } from "@/features/campaign/analysis/descriptor";
import type { SourceAssociation } from "@/features/campaign/analysis/descriptor";
import { fileVersion, sameFileVersion } from "@/features/campaign/types";
import { localSaveRegistry, holdsRef } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { toPlaythroughId } from "@/features/campaign/types";
import { importTimeline } from "./importSnapshots";
import { useHistory } from "./store";

/** Analyze local campaign entries without opening a save or controlling navigation. */
export async function analyzeCampaign(entries: LocalSaveEntry[], playthroughId: string) {
  if (!playthroughId) throw Error("This save has no campaign identity.");
  if (useHistory.getState().progress) throw Error("An analysis is already running.");
  if (!entries.length) throw Error("Add local saves to analyze this campaign.");
  if (entries.length > 1000) throw Error("Analyze at most 1000 saves at a time.");
  const controller = new AbortController();
  const startedAt = performance.now();
  const issues: string[] = [];
  useHistory.setState((state) => ({
    analysisPaused: false,
    analysisPausedCampaigns: state.analysisPausedCampaigns.filter((id) => id !== playthroughId),
    progress: { completed: 0, total: entries.length, startedAt },
    analyzingEntryIds: [],
    issues: [],
    cancel: () => {
      useHistory.setState((state) => ({
        analysisPausedCampaigns: state.analysisPausedCampaigns.includes(playthroughId)
          ? state.analysisPausedCampaigns
          : [...state.analysisPausedCampaigns, playthroughId],
      }));
      controller.abort();
    },
  }));
  const { signal } = controller;
  let rejectAborted!: (error: DOMException) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAborted = reject;
  });
  const onAbort = () => rejectAborted(new DOMException("Import cancelled", "AbortError"));
  signal.addEventListener("abort", onAbort, { once: true });
  void aborted.catch(() => {});
  try {
    const resolved = await Promise.race([
      Promise.allSettled(
        entries.map(async (entry) => ({
          entry,
          file: entry.ref.kind === "handle" ? await entry.ref.file.getFile() : entry.ref.file,
        })),
      ),
      aborted,
    ]);
    const sources = resolved.flatMap((result, i) => {
      if (result.status === "fulfilled") return [result.value];
      issues.push(`${entries[i].name}: ${String(result.reason)}`);
      return [];
    });
    if (signal.aborted) return;
    let lastProgress = 0;
    const result = await importTimeline(
      sources.map((source) => source.file),
      {
        signal,
        onActiveFiles: (active) => {
          if (signal.aborted) return;
          const files = new Set(active);
          useHistory.setState({
            analyzingEntryIds: sources
              .filter(({ entry, file }) => {
                const current = localSaveRegistry.get(entry.id);
                return files.has(file) && current && holdsRef(current, entry.ref);
              })
              .map(({ entry }) => entry.id),
          });
        },
        onProgress: (completed, total, fileName, phase) => {
          const now = performance.now();
          if (completed === total || phase?.completed === 0 || now - lastProgress > 150) {
            lastProgress = now;
            useHistory.setState({
              progress: {
                completed: completed + (entries.length - sources.length),
                total: total + (entries.length - sources.length),
                startedAt,
                fileName,
                phase,
              },
            });
          }
        },
        onSnapshots: (snapshots, observations) => {
          const associations: Record<string, SourceAssociation> = {};
          for (const { snapshot, file: parsedFile } of observations) {
            for (const { entry, file } of sources) {
              if (parsedFile !== file) continue;
              const current = localSaveRegistry.get(entry.id);
              // A removed or replaced entry cannot receive a stale result.
              if (!current || !holdsRef(current, entry.ref)) continue;
              // Navigation may have already read a newer version of this handle.
              const versionChanged =
                current.version &&
                (current.version.size !== entry.version?.size ||
                  current.version.lastModified !== entry.version?.lastModified);
              if (versionChanged && current.version && !sameFileVersion(file, current.version))
                continue;
              localSaveRegistry.recordIdentity(
                entry.id,
                {
                  playthroughId: toPlaythroughId(snapshot.campaignId),
                  campaignIdHint: null,
                  date: descriptorDate(snapshot),
                },
                fileVersion(file),
              );
              associations[entry.id] = { snapshotId: snapshot.id, version: fileVersion(file) };
            }
            if (snapshot.campaignId !== playthroughId)
              issues.push(
                `${parsedFile.name}: belongs to another campaign; excluded from these charts.`,
              );
          }
          useHistory.getState().add(
            snapshots.filter((snapshot) => snapshot.campaignId === playthroughId),
            associations,
          );
        },
      },
    );
    issues.push(...result.errors.map((error) => `${error.fileName}: ${error.error}`));
    if (result.memoryFull) {
      const { message, refused } = result.memoryFull;
      const saves = refused === 1 ? "1 save was" : `${refused} saves were`;
      issues.push(
        `${message} ${saves} not analyzed. Clear the campaign analysis to analyze other saves.`,
      );
      useHistory.setState((state) => ({
        // Do not parse more saves that cannot fit.
        analysisPausedCampaigns: state.analysisPausedCampaigns.includes(playthroughId)
          ? state.analysisPausedCampaigns
          : [...state.analysisPausedCampaigns, playthroughId],
      }));
    }
  } catch (error) {
    if (!signal.aborted) {
      issues.push(String(error));
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    useHistory.setState((state) => {
      return {
        progress: null,
        analyzingEntryIds: [],
        cancel: null,
        issues: signal.aborted ? [...new Set([...state.issues, ...issues])] : issues,
      };
    });
  }
}
