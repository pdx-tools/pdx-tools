import { analysisAdmission } from "@/features/campaign/analysis/admission";
import { importBatch } from "@/features/campaign/analysis/importScheduler";
import type { AnalysisSink, ParserAdapter } from "@/features/campaign/analysis/importScheduler";
import {
  associateSources,
  currentEntry,
  readSources,
  sourcesByFile,
} from "@/features/campaign/analysis/sources";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { fileVersion } from "@/features/campaign/types";
import type { AnalysisHistory } from "./analysisState";
import type { SnapshotDescriptor } from "./descriptor";
import type { ImportPhaseState } from "./importTiming";

/** The parts of a game that analyze its campaign saves. */
export type CampaignAnalyzer<Api, R, D extends SnapshotDescriptor> = {
  history: AnalysisHistory<D>;
  analysis: AnalysisSink<R, D> & { claim: (campaignId: string) => void };
  parser: ParserAdapter<Api, R>;
};

/** Analyze local campaign entries without opening a save or controlling navigation. */
export function campaignAnalyzer<
  Api,
  R extends { descriptor: SnapshotDescriptor },
  D extends SnapshotDescriptor,
>({ history, analysis, parser }: CampaignAnalyzer<Api, R, D>) {
  return async function analyzeCampaign(entries: LocalSaveEntry[], playthroughId: string) {
    if (!playthroughId) throw Error("This save has no campaign identity.");
    if (!entries.length) throw Error("Add local saves to analyze this campaign.");
    if (entries.length > 1000) throw Error("Analyze at most 1000 saves at a time.");
    // One import runs in the tab, for all games.
    const lease = analysisAdmission().acquireImport();
    analysis.claim(playthroughId);
    // Another claim, such as of a save that opens while files are read, ends the import.
    const session = analysis.signal();
    const controller = new AbortController();
    const startedAt = performance.now();
    const issues: string[] = [];
    history.setState((state) => ({
      analysisPausedCampaigns: state.analysisPausedCampaigns.filter((id) => id !== playthroughId),
      progress: { completed: 0, total: entries.length, startedAt },
      analyzingEntryIds: [],
      issues: [],
      cancel: () => {
        history.getState().pauseAnalysis(playthroughId);
        controller.abort();
      },
    }));
    const signal = AbortSignal.any([controller.signal, session]);
    const recordFailure = (entry: LocalSaveEntry, error: string, file?: File) => {
      if (!currentEntry(entry, file)) return;
      const version = file ? fileVersion(file) : entry.version;
      history.setState((state) => ({
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
      const byFile = sourcesByFile(sources);
      const sourcesOf = (file: File) => byFile.get(file) ?? [];
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
        parser,
        analysis,
        {
          signal,
          lease,
          onFileComplete: (completion) => {
            const { file } = completion;
            if ("descriptor" in completion) {
              const { descriptor } = completion;
              history
                .getState()
                .add([descriptor], associateSources(sourcesOf(file), file, descriptor));
            } else if (completion.status === "failed" && !otherCampaign.has(file)) {
              for (const { entry } of sourcesOf(file)) recordFailure(entry, completion.error, file);
            }
          },
          onActiveFiles: (active) => {
            if (signal.aborted) return;
            history.setState({
              analyzingEntryIds: active.flatMap((file) =>
                sourcesOf(file).flatMap(({ entry }) => (currentEntry(entry) ? [entry.id] : [])),
              ),
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
              history.setState({
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
            const ids = Object.keys(associateSources(sourcesOf(file), file, descriptor));
            history.setState((state) => ({
              failedSources: Object.fromEntries(
                Object.entries(state.failedSources).filter(([id]) => !ids.includes(id)),
              ),
            }));
            return "belongs to another campaign; not analyzed with this campaign.";
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
        // Do not parse more saves that cannot fit.
        history.getState().pauseAnalysis(playthroughId);
      }
    } catch (error) {
      if (!signal.aborted) issues.push(String(error));
    } finally {
      lease.release();
      history.setState((state) => ({
        progress: null,
        analyzingEntryIds: [],
        cancel: null,
        issues: signal.aborted ? [...new Set([...state.issues, ...issues])] : issues,
      }));
    }
  };
}
