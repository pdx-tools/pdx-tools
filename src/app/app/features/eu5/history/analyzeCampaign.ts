import { importBatch } from "@/features/campaign/analysis/importScheduler";
import { associateSources, readSources } from "@/features/campaign/analysis/sources";
import { localSaveRegistry, holdsRef } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { eu5AnalysisSink } from "./analysisClient";
import { eu5ParserAdapter } from "./parserAdapter";
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
  const pause = (state: { analysisPausedCampaigns: string[] }) =>
    state.analysisPausedCampaigns.includes(playthroughId)
      ? state.analysisPausedCampaigns
      : [...state.analysisPausedCampaigns, playthroughId];
  useHistory.setState((state) => ({
    analysisPaused: false,
    analysisPausedCampaigns: state.analysisPausedCampaigns.filter((id) => id !== playthroughId),
    progress: { completed: 0, total: entries.length, startedAt },
    analyzingEntryIds: [],
    issues: [],
    cancel: () => {
      useHistory.setState((state) => ({ analysisPausedCampaigns: pause(state) }));
      controller.abort();
    },
  }));
  const { signal } = controller;
  try {
    const { sources, failures } = await readSources(entries, signal);
    issues.push(...failures.map(({ entry, error }) => `${entry.name}: ${error}`));
    if (signal.aborted) return;
    const unread = failures.length;
    let lastProgress = 0;
    const result = await importBatch(
      sources.map((source) => source.file),
      eu5ParserAdapter,
      eu5AnalysisSink,
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
        onProgress: ({ completed, total, fileName, active }) => {
          const now = performance.now();
          if (completed !== total && now - lastProgress <= 150) return;
          lastProgress = now;
          useHistory.setState({
            progress: {
              completed: completed + unread,
              total: total + unread,
              startedAt,
              fileName,
              phase: { phase: "import", completed, total, startedAt, concurrency: active || 1 },
            },
          });
        },
        onCommitted: (descriptor, file) => {
          const associations = associateSources(sources, file, descriptor);
          const included = descriptor.campaignId === playthroughId;
          if (!included)
            issues.push(`${file.name}: belongs to another campaign; excluded from these charts.`);
          useHistory.getState().add(included ? [descriptor] : [], associations);
        },
      },
    );
    issues.push(...result.failures.map(({ fileName, error }) => `${fileName}: ${error}`));
    if (result.memoryFull) {
      const left = result.outcomes.refused + result.outcomes.unprocessed;
      const saves = left === 1 ? "1 save was" : `${left} saves were`;
      useHistory.setState((state) => ({
        memoryFull: `${result.memoryFull} ${saves} not analyzed. Clear the campaign analysis to analyze other saves.`,
        // Do not parse more saves that cannot fit.
        analysisPausedCampaigns: pause(state),
      }));
    }
  } catch (error) {
    if (!signal.aborted) issues.push(String(error));
  } finally {
    useHistory.setState((state) => ({
      progress: null,
      analyzingEntryIds: [],
      cancel: null,
      issues: signal.aborted ? [...new Set([...state.issues, ...issues])] : issues,
    }));
  }
}
