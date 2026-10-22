import { analysisAdmission } from "@/features/campaign/analysis/admission";
import { importBatch } from "@/features/campaign/analysis/importScheduler";
import { associateSources, readSources } from "@/features/campaign/analysis/sources";
import { localSaveRegistry, holdsRef } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { fileVersion, sameFileVersion } from "@/features/campaign/types";
import { eu5Analysis } from "./analysisClient";
import type { ImportPhaseState } from "./importTiming";
import { eu5ParserAdapter } from "./parserAdapter";
import { useHistory } from "./store";

const pause = (paused: string[], campaignId: string) =>
  paused.includes(campaignId) ? paused : [...paused, campaignId];

/** Analyze local campaign entries without opening a save or controlling navigation. */
export async function analyzeCampaign(entries: LocalSaveEntry[], playthroughId: string) {
  if (!playthroughId) throw Error("This save has no campaign identity.");
  if (!entries.length) throw Error("Add local saves to analyze this campaign.");
  if (entries.length > 1000) throw Error("Analyze at most 1000 saves at a time.");
  // One import runs in the tab, for all games.
  const lease = analysisAdmission().acquireImport();
  eu5Analysis.claim(playthroughId);
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
        analysisPausedCampaigns: pause(state.analysisPausedCampaigns, playthroughId),
      }));
      controller.abort();
    },
  }));
  const { signal } = controller;
  const recordFailure = (entry: LocalSaveEntry, error: string, file?: File) => {
    const current = localSaveRegistry.get(entry.id);
    if (!current || !holdsRef(current, entry.ref)) return;
    // Navigation can read a newer version of a file handle during the import.
    if (
      file &&
      current.version &&
      current.version !== entry.version &&
      !sameFileVersion(file, current.version)
    )
      return;
    const version = file ? fileVersion(file) : entry.version;
    useHistory.setState((state) => ({
      failedSources: { ...state.failedSources, [entry.id]: { version, error } },
    }));
  };
  try {
    const { sources, failures } = await readSources(entries, signal).catch((error) => {
      if (signal.aborted) return { sources: [], failures: [] };
      throw error;
    });
    if (signal.aborted) return;
    for (const { entry, error } of failures) {
      issues.push(`${entry.name}: ${error}`);
      recordFailure(entry, error);
    }
    const unavailable = entries.length - sources.length;
    // These saves are not failures. Their identity moves them to another campaign.
    const otherCampaign = new Set<File>();
    let lastProgress = 0;
    let phase: ImportPhaseState = {
      phase: "import",
      completed: 0,
      total: sources.length,
      startedAt,
    };
    const result = await importBatch(
      sources.map((source) => source.file),
      eu5ParserAdapter,
      eu5Analysis,
      {
        signal,
        lease,
        onFileOutcome: (file, outcome, error) => {
          if (outcome !== "failed" || otherCampaign.has(file)) return;
          for (const source of sources)
            if (source.file === file) recordFailure(source.entry, error ?? "", file);
        },
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
        onProgress: ({ completed, total, fileName, active }) => {
          phase = {
            ...phase,
            completed,
            concurrency: Math.max(phase.concurrency ?? 1, active),
          };
          const now = performance.now();
          if (completed === total || now - lastProgress > 150) {
            lastProgress = now;
            useHistory.setState({
              progress: {
                completed: completed + unavailable,
                total: total + unavailable,
                startedAt,
                fileName,
                phase,
              },
            });
          }
        },
        // A save of another campaign does not use the memory of this analysis.
        refuseOutput: ({ descriptor }, file) => {
          if (descriptor.campaignId === playthroughId) return null;
          // The local save remembers its campaign, so navigation does not show it here.
          otherCampaign.add(file);
          const ids = Object.keys(associateSources(sources, file, descriptor));
          useHistory.setState((state) => ({
            failedSources: Object.fromEntries(
              Object.entries(state.failedSources).filter(([id]) => !ids.includes(id)),
            ),
          }));
          return "belongs to another campaign; not analyzed with this campaign.";
        },
        onCommitted: (snapshot, file) => {
          useHistory.getState().add([snapshot], associateSources(sources, file, snapshot));
        },
      },
    );
    issues.push(...result.failures.map(({ fileName, error }) => `${fileName}: ${error}`));
    if (result.memoryFull) {
      const refused = result.outcomes.refused + result.outcomes.unprocessed;
      const saves = refused === 1 ? "1 save was" : `${refused} saves were`;
      issues.push(
        `${result.memoryFull} ${saves} not analyzed. Clear the campaign analysis to analyze other saves.`,
      );
      useHistory.setState((state) => ({
        // Do not parse more saves that cannot fit.
        analysisPausedCampaigns: pause(state.analysisPausedCampaigns, playthroughId),
      }));
    }
  } catch (error) {
    if (!signal.aborted) issues.push(String(error));
  } finally {
    lease.release();
    useHistory.setState((state) => ({
      progress: null,
      analyzingEntryIds: [],
      cancel: null,
      issues: signal.aborted ? [...new Set([...state.issues, ...issues])] : issues,
    }));
  }
}
