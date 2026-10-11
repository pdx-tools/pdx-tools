import { rememberPlaybackIdentity } from "./playbackCache";
import { rememberSaveFile } from "../saveCacheKey";
import {
  fileVersion,
  getLocalSave,
  holdsRef,
  sameFileVersion,
  setLocalSaveIdentity,
} from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { toPlaythroughId } from "@/features/campaign/types";
import { cachedSnapshots } from "./cache";
import { importTimeline } from "./importSnapshots";
import { useHistory } from "./store";
import type { SourceObservation } from "./store";

/** Analyze local campaign entries without opening a save or controlling navigation. */
export async function analyzeCampaign(entries: LocalSaveEntry[], playthroughId: string) {
  if (!playthroughId) throw Error("This save has no campaign identity.");
  if (useHistory.getState().progress) throw Error("An analysis is already running.");
  if (!entries.length) throw Error("Add local saves to analyze this campaign.");
  if (entries.length > 1000) throw Error("Analyze at most 1000 saves at a time.");
  const controller = new AbortController();
  const startedAt = performance.now();
  const issues: string[] = [];
  useHistory.setState({
    analysisPaused: false,
    progress: { completed: 0, total: entries.length * 2, startedAt },
    issues: [],
    cancel: () => {
      useHistory.setState({ analysisPaused: true });
      controller.abort();
    },
  });
  const { signal } = controller;
  try {
    try {
      if (!useHistory.getState().snapshots.length)
        useHistory.getState().add(await cachedSnapshots());
    } catch {
      issues.push("Browser cache unavailable; observations remain available for this session.");
    }
    if (signal.aborted) return;
    const resolved = await Promise.allSettled(
      entries.map(async (entry) => ({
        entry,
        file: entry.ref.kind === "handle" ? await entry.ref.file.getFile() : entry.ref.file,
      })),
    );
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
        existing: useHistory.getState().snapshots,
        onProgress: (completed, total, fileName) => {
          const now = performance.now();
          if (completed === total || now - lastProgress > 150) {
            lastProgress = now;
            useHistory.setState({
              analysisPaused: false,
              progress: {
                completed: completed + (entries.length - sources.length) * 2,
                total: total + (entries.length - sources.length) * 2,
                startedAt,
                fileName,
              },
            });
          }
        },
        onWarning: (warning) => issues.push(warning),
        onSnapshots: (snapshots, observations) => {
          if (signal.aborted) return;
          const associations: Record<string, SourceObservation> = {};
          for (const { snapshot, file: parsedFile } of observations) {
            for (const { entry, file } of sources) {
              if (parsedFile !== file) continue;
              const current = getLocalSave(entry.id);
              // A removed or replaced entry cannot receive a stale result.
              if (!current || !holdsRef(current, entry.ref)) continue;
              // Navigation may have already read a newer version of this handle.
              const versionChanged =
                current.version &&
                (current.version.size !== entry.version?.size ||
                  current.version.lastModified !== entry.version?.lastModified);
              if (versionChanged && current.version && !sameFileVersion(file, current.version))
                continue;
              setLocalSaveIdentity(
                entry.id,
                {
                  playthroughId: toPlaythroughId(snapshot.campaignId),
                  campaignIdHint: null,
                  date: {
                    year: Math.floor(snapshot.dateSort / 10000),
                    month: Math.floor(snapshot.dateSort / 100) % 100,
                    day: snapshot.dateSort % 100,
                  },
                },
                fileVersion(file),
              );
              rememberSaveFile(file, entry.ref);
              rememberPlaybackIdentity({ kind: "file", file }, snapshot.hash);
              associations[entry.id] = { hash: snapshot.hash, version: fileVersion(file) };
            }
            if (snapshot.campaignId !== playthroughId)
              issues.push(
                `${snapshot.fileName}: belongs to another campaign; excluded from these charts.`,
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
  } catch (error) {
    if (!signal.aborted) issues.push(String(error));
  } finally {
    useHistory.setState({ progress: null, cancel: null, issues });
  }
}
