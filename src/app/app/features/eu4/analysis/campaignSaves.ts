import { localSaveRegistry } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { CampaignAnalysisState } from "@/features/campaign/analysis/analysisState";
import type { CampaignUpload } from "@/features/campaign/analysis/analyzeCampaign";
import { isEntryAnalyzed } from "@/features/campaign/analysis/autoAnalysis";
import {
  localSaveAnalysisStatus,
  localSaveSnapshotId,
} from "@/features/campaign/analysis/saveStatus";
import type { SaveAnalysisStatus } from "@/features/campaign/saveAnalysisPresentation";
import { saveProblemText } from "@/features/campaign/saveText";
import { isFiguresOnly } from "@/features/campaign/types";
import type { CampaignSave, ChartedSave, FiguresOnlySave } from "@/features/campaign/types";
import {
  branchTip,
  datedPoints,
  liveTip,
  watchedPath,
} from "@/features/campaign/analysis/watchedWrite";
import { dateSort, descriptorDate } from "@/features/campaign/analysis/descriptor";
import type { DateComponents } from "@/features/timeline/date";
import type { Eu4SnapshotDescriptor } from "./analysisTypes";

/** A campaign save that analysis reads, and its snapshot when analysis has it. */
export type AnalysisSave = {
  save: ChartedSave;
  /** The date that the parse read, or the date of the campaign list before a parse. */
  date: DateComponents;
  status: SaveAnalysisStatus;
  snapshot: Eu4SnapshotDescriptor | null;
  /** Why the save has no snapshot, when it failed. */
  error: string | null;
  /** True when a retry can work, such as after a failed download. */
  retry: boolean;
};

type AnalysisState = Pick<
  CampaignAnalysisState<Eu4SnapshotDescriptor>,
  "sources" | "snapshots" | "failedSources" | "analyzingEntryIds" | "uploads" | "analyzingUploadIds"
>;

/**
 * The saves that analysis reads: the campaign list keeps one save per date,
 * and a save known to be of another campaign is left out. Where a date has
 * a local file and an upload, the list keeps the file, so nothing downloads.
 * A save with figures only has its snapshot already.
 */
export function analysisCandidates(saves: readonly ChartedSave[]): ChartedSave[] {
  return saves.filter((save) => isFiguresOnly(save) || save.membership !== "different");
}

/** The key of a save with figures only. */
export const figuresKey = (snapshotId: string) => `figures:${snapshotId}`;

type PointState = Pick<
  CampaignAnalysisState,
  "snapshots" | "points" | "sources" | "uploads" | "sessions"
>;

/**
 * The saves that open, and the points of the campaign that no file or upload
 * holds now, as saves with figures only.
 */
export function campaignPoints(
  saves: readonly CampaignSave[],
  state: PointState,
  playthroughId: string | null,
): ChartedSave[] {
  const points = datedPoints(state);
  const live = new Set(watchedPath(points, liveTip(points)));
  const held = new Set([
    ...Object.values(state.sources).map((x) => x.snapshotId),
    ...Object.values(state.uploads).flatMap((x) => (x.kind === "ready" ? [x.snapshotId] : [])),
  ]);
  const figures = state.snapshots.flatMap((snapshot): FiguresOnlySave[] => {
    const point = state.points[snapshot.id];
    if (!point || held.has(snapshot.id) || snapshot.campaignId !== playthroughId) return [];
    // A watched state of an earlier visit is not open either.
    const reason =
      point.session !== null && !live.has(snapshot.id)
        ? "otherBranch"
        : point.session !== null && !state.sessions[point.session]?.restored
          ? "writtenOver"
          : "notOpen";
    return [
      {
        key: figuresKey(snapshot.id),
        date: descriptorDate(snapshot),
        name:
          point.sourceKeys.at(-1)?.name ??
          (point.source?.kind === "upload" ? "Upload" : (point.source?.name ?? "")),
        isOpen: false,
        source: { kind: "figures", snapshotId: snapshot.id, reason },
      },
    ];
  });
  return [...saves, ...figures];
}

/**
 * The saves on one path of the campaign: the branch of the selected point, up
 * to its newest write, or the game's current path, and every dropped file and
 * upload by date. Watched states of other branches stay out.
 */
export function onePath(
  saves: readonly AnalysisSave[],
  state: Pick<CampaignAnalysisState, "snapshots" | "points" | "sessions">,
  selectedKey: string | null,
): AnalysisSave[] {
  const points = datedPoints(state);
  const selected = saves.find((x) => x.save.key === selectedKey)?.snapshot?.id;
  const live = liveTip(points);
  let tip = live;
  if (
    selected &&
    points.get(selected)?.session != null &&
    !watchedPath(points, live).includes(selected)
  ) {
    tip = branchTip(points, selected);
  }
  const path = new Set(watchedPath(points, tip));
  // A file that a watch run wrote follows its path; uploads and other files join by date.
  const byPath = (save: ChartedSave, session: string) =>
    isFiguresOnly(save) ||
    (save.source.kind === "local" && save.source.entryId === state.sessions[session]?.entryId);
  return saves.filter((x) => {
    const id = x.snapshot?.id;
    const session = id ? points.get(id)?.session : null;
    return !id || session == null || !byPath(x.save, session) || path.has(id);
  });
}

/** The key of the save that shows a point: its file, its upload, or its figures. */
export function pointKey(
  state: Pick<CampaignAnalysisState, "sources" | "uploads">,
  snapshotId: string,
): string {
  const file = Object.entries(state.sources).find(([, x]) => x.snapshotId === snapshotId);
  if (file) return `local:${file[0]}`;
  const upload = Object.entries(state.uploads).find(
    ([, x]) => x.kind === "ready" && x.snapshotId === snapshotId,
  );
  return upload ? `upload:${upload[0]}` : figuresKey(snapshotId);
}

/** The registry entries of the candidates that analysis has not read in their current version. */
export function pendingEntries(
  saves: readonly ChartedSave[],
  state: Pick<CampaignAnalysisState, "sources" | "snapshots">,
): LocalSaveEntry[] {
  const stored = new Set(state.snapshots.map((snapshot) => snapshot.id));
  return analysisCandidates(saves).flatMap((save) => {
    const entry = save.source.kind === "local" && save.source.entryId;
    const current = entry ? localSaveRegistry.get(entry) : undefined;
    return current && !isEntryAnalyzed(current, state.sources, stored) ? [current] : [];
  });
}

/** The snapshot that a candidate is bound to: the one of its file version, or of its upload. */
function boundSnapshotId(
  save: ChartedSave,
  state: Pick<CampaignAnalysisState, "sources" | "uploads">,
): string | null {
  if (isFiguresOnly(save)) return save.source.snapshotId;
  if (save.source.kind === "local") return localSaveSnapshotId(save, state.sources);
  const upload = state.uploads[save.source.saveId];
  return upload?.kind === "ready" ? upload.snapshotId : null;
}

/**
 * The snapshots that no candidate is bound to, on a date where a candidate
 * waits for analysis, such as a file that the game wrote again. The store
 * keeps one snapshot for each date, so these go before that analysis.
 */
export function replacedSnapshots(
  saves: readonly ChartedSave[],
  state: Pick<CampaignAnalysisState, "sources" | "uploads" | "snapshots" | "points">,
): string[] {
  const bound = new Set<string>();
  const waiting = new Set<number>();
  for (const save of analysisCandidates(saves)) {
    const id = boundSnapshotId(save, state);
    if (id) {
      bound.add(id);
      continue;
    }
    // The list gives the open save the date that the viewer read; the file can be newer.
    waiting.add(dateSort(save.date));
    const entryId = save.source.kind === "local" ? save.source.entryId : null;
    const current = entryId ? localSaveRegistry.get(entryId)?.identity : null;
    if (current) waiting.add(dateSort(current.date));
  }
  return (
    state.snapshots
      // Watched writes stay: the game wrote over their files.
      .filter(
        (snapshot) =>
          !bound.has(snapshot.id) &&
          waiting.has(snapshot.dateSort) &&
          state.points[snapshot.id]?.session == null &&
          !state.points[snapshot.id]?.kept,
      )
      .map((snapshot) => snapshot.id)
  );
}

/** The uploads of the candidates without a snapshot, except those that could not be read. */
export function pendingUploads(
  saves: readonly ChartedSave[],
  state: Pick<CampaignAnalysisState, "uploads" | "snapshots">,
): CampaignUpload[] {
  const stored = new Set(state.snapshots.map((snapshot) => snapshot.id));
  return analysisCandidates(saves).flatMap((save) => {
    if (save.source.kind !== "upload") return [];
    const upload = state.uploads[save.source.saveId];
    const done =
      (upload?.kind === "ready" && stored.has(upload.snapshotId)) ||
      (upload?.kind === "failed" && upload.reason === "read");
    return done ? [] : [{ saveId: save.source.saveId, name: save.name }];
  });
}

/**
 * Each candidate with its analysis status and the snapshot of its current
 * version. The entries are those of the registry now.
 */
export function analysisSaves(
  saves: readonly ChartedSave[],
  state: AnalysisState,
  entries: readonly LocalSaveEntry[],
): AnalysisSave[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const byId = new Map(state.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const ready = new Set(byId.keys());
  return (
    analysisCandidates(saves)
      .map((save): AnalysisSave => {
        if (isFiguresOnly(save)) {
          const snapshot = byId.get(save.source.snapshotId) ?? null;
          return {
            save,
            date: snapshot ? descriptorDate(snapshot) : save.date,
            status: snapshot ? "ready" : "failed",
            snapshot,
            error: null,
            retry: false,
          };
        }
        if (save.source.kind === "upload") {
          const { saveId } = save.source;
          const upload = state.uploads[saveId];
          const snapshot = upload?.kind === "ready" ? (byId.get(upload.snapshotId) ?? null) : null;
          const failed = upload?.kind === "failed" ? upload : null;
          return {
            save,
            date: snapshot ? descriptorDate(snapshot) : save.date,
            status: snapshot
              ? "ready"
              : state.analyzingUploadIds.includes(saveId)
                ? "analyzing"
                : failed
                  ? "failed"
                  : "pending",
            snapshot,
            error: failed && !snapshot ? failed.error : null,
            retry: failed?.reason === "download",
          };
        }
        const status = localSaveAnalysisStatus(save, state, ready) ?? "pending";
        const id = localSaveSnapshotId(save, state.sources);
        const entryId = save.source.entryId;
        const failure = entryId ? state.failedSources[entryId] : undefined;
        const problem = entryId ? entryById.get(entryId)?.problem : null;
        const snapshot = status === "ready" && id ? (byId.get(id) ?? null) : null;
        return {
          save,
          date: snapshot ? descriptorDate(snapshot) : save.date,
          status,
          snapshot,
          error:
            status !== "failed"
              ? null
              : problem && problem.kind !== "moved"
                ? saveProblemText(problem)
                : (failure?.error ?? null),
          retry: false,
        };
      })
      // Dots sit at the parsed date, so Earlier and Later save follow them.
      .sort((a, b) => dateSort(a.date) - dateSort(b.date))
  );
}
