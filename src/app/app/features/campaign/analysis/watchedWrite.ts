import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { IMPORT_BUSY_ERROR, analysisAdmission } from "./admission";
import type { CampaignAnalysisState, CampaignPoint } from "./analysisState";
import type { CampaignAnalyzer } from "./analyzeCampaign";
import type { SnapshotDescriptor } from "./descriptor";
import { importBatch } from "./importScheduler";
import type { AnalysisSink, AppendResult } from "./importScheduler";
import { MEMORY_LIMIT_ERROR } from "./session";
import { associateSources } from "./sources";

/** A point with its date, as the write rules read it. */
export type DatedPoint = Pick<CampaignPoint, "seq" | "parent" | "session"> & { dateSort: number };

/** The points of a campaign by snapshot ID, with their dates. */
export function datedPoints(
  state: Pick<CampaignAnalysisState, "snapshots" | "points">,
): Map<string, DatedPoint> {
  return new Map(
    state.snapshots.flatMap((x) => {
      const point = state.points[x.id];
      return point ? [[x.id, { ...point, dateSort: x.dateSort }] as const] : [];
    }),
  );
}

/** The watched point and its watched ancestors, newest first. */
export function watchedPath(points: ReadonlyMap<string, DatedPoint>, id: string | null): string[] {
  const path = new Set<string>();
  for (let at = id; at !== null && !path.has(at); at = points.get(at)?.parent ?? null) path.add(at);
  return [...path];
}

/** The newest watched point whose path holds `id`: the end of `id`'s branch. */
export function branchTip(points: ReadonlyMap<string, DatedPoint>, id: string): string {
  // Each point is walked once: a point holds `id` when it is `id` or its parent holds it.
  const holds = new Map<string, boolean>([[id, true]]);
  const held = (from: string) => {
    const walked = new Set<string>();
    let at: string | null = from;
    while (at !== null && !holds.has(at) && !walked.has(at)) {
      walked.add(at);
      at = points.get(at)?.parent ?? null;
    }
    const result = at !== null && holds.get(at) === true;
    for (const x of walked) holds.set(x, result);
    return result;
  };
  let tip: [string, DatedPoint] | null = null;
  for (const entry of points)
    if (entry[1].session !== null && (!tip || entry[1].seq > tip[1].seq) && held(entry[0]))
      tip = entry;
  return tip?.[0] ?? id;
}

/** The newest watched point, whose path is the game's current one. */
export function liveTip(points: ReadonlyMap<string, DatedPoint>): string | null {
  let tip: [string, DatedPoint] | null = null;
  for (const entry of points)
    if (entry[1].session !== null && (!tip || entry[1].seq > tip[1].seq)) tip = entry;
  return tip?.[0] ?? null;
}

/** The last point of a watch run, or the live tip before the run has one. */
export function sessionHead(points: ReadonlyMap<string, DatedPoint>, session: string) {
  let head: [string, DatedPoint] | null = null;
  for (const entry of points)
    if (entry[1].session === session && (!head || entry[1].seq > head[1].seq)) head = entry;
  return head?.[0] ?? liveTip(points);
}

/**
 * Make the state that a file held when its watch began the first point of
 * the run, so the run's path starts where the player was.
 */
export function adoptWatchStart(
  state: Pick<CampaignAnalysisState, "snapshots" | "points" | "sources" | "nextSeq" | "sessions">,
  entry: Pick<LocalSaveEntry, "id" | "name">,
  session: string,
): Pick<CampaignAnalysisState, "points" | "nextSeq" | "sessions"> | null {
  const entryId = entry.id;
  const id = state.sources[entryId]?.snapshotId;
  const point = id ? state.points[id] : undefined;
  const snapshot = state.snapshots.find((x) => x.id === id);
  if (!id || !point || !snapshot || point.session !== null) return null;
  // Placed by date like a write, and seen now, so it becomes the newest watched point.
  const rest = datedPoints(state);
  rest.delete(id);
  const placed = classifyWrite(snapshot, rest, liveTip(rest));
  const parent = placed.kind === "duplicate" ? null : placed.parent;
  return {
    points: { ...state.points, [id]: { ...point, session, parent, seq: state.nextSeq } },
    nextSeq: state.nextSeq + 1,
    sessions: { ...state.sessions, [session]: { entryId, fileName: entry.name } },
  };
}

/** What a watched write that parsed in the campaign does to its points. */
export type WriteClass =
  /** The write is a point already. Only its source key is added. */
  | { kind: "duplicate"; id: string }
  /** A later date than the last write. */
  | { kind: "added"; id: string; parent: string | null }
  /** The same date as the last write: it replaces that point. */
  | { kind: "replaced"; id: string; parent: string | null; replaced: string }
  /** An earlier date: the game went back. The later points stay on another branch. */
  | { kind: "branched"; id: string; parent: string | null; tip: string; left: number };

/**
 * Place a watched write after the last write of its run. A failed read never
 * gets here, so nothing branches, replaces or leaves on a failure.
 */
export function classifyWrite(
  next: { id: string; dateSort: number },
  points: ReadonlyMap<string, DatedPoint>,
  head: string | null,
): WriteClass {
  const { id } = next;
  if (points.has(id)) return { kind: "duplicate", id };
  const last = head === null ? undefined : points.get(head);
  if (head === null || !last || next.dateSort > last.dateSort)
    return { kind: "added", id, parent: head };
  if (next.dateSort === last.dateSort)
    return { kind: "replaced", id, parent: last.parent, replaced: head };
  const path = watchedPath(points, head);
  const fork = path.findIndex((x) => points.get(x)!.dateSort <= next.dateSort);
  return {
    kind: "branched",
    id,
    parent: fork < 0 ? null : path[fork],
    tip: head,
    left: fork < 0 ? path.length : fork,
  };
}

export type WriteOutcome =
  | WriteClass
  /** A complete parse of another playthrough. Only this stops the watch. */
  | { kind: "otherCampaign" }
  /** A read or parse failed, such as while the game writes the file. */
  | { kind: "failed"; error: string }
  /** Another analysis runs. Try again later. */
  | { kind: "busy" }
  /** The campaign analysis is full. */
  | { kind: "full"; error: string };

/** True when a save other than this entry holds the snapshot. */
function heldElsewhere(
  state: Pick<CampaignAnalysisState, "sources" | "uploads">,
  entryId: string,
  id: string,
) {
  return (
    Object.entries(state.sources).some(
      ([x, source]) => x !== entryId && source.snapshotId === id,
    ) || Object.values(state.uploads).some((x) => x.kind === "ready" && x.snapshotId === id)
  );
}

/** Add the figures of a new write of a watched file to the campaign analysis. */
export function watchedWriteImporter<
  Api,
  R extends { descriptor: SnapshotDescriptor },
  D extends SnapshotDescriptor,
>({
  history,
  analysis,
  parser,
}: Pick<CampaignAnalyzer<Api, R, D>, "history" | "analysis" | "parser">) {
  return async function importWrite(
    entry: LocalSaveEntry,
    file: File,
    playthroughId: string,
    /** The watch run of the write. */
    session: string,
    /**
     * The file as it was when the watch began. It is placed like a write, but
     * the player opened it, so it replaces nothing.
     */
    start: boolean,
    /** The snapshot of this write, when the viewer's parse gave it. */
    parsed: R | null = null,
  ): Promise<WriteOutcome> {
    let lease;
    try {
      lease = analysisAdmission().acquireImport();
    } catch (error) {
      if (error instanceof Error && error.name === IMPORT_BUSY_ERROR) return { kind: "busy" };
      throw error;
    }
    let placed: WriteClass | null = null;
    const sink: AnalysisSink<R, D> = {
      generation: analysis.generation,
      signal: analysis.signal,
      append: async (generation, output, lease): Promise<AppendResult<D>> => {
        const state = history.getState();
        const points = datedPoints(state);
        placed = classifyWrite(output.descriptor, points, sessionHead(points, session));
        // A replaced point that no other save holds goes, unless later points build on it.
        if (placed.kind === "replaced" && !start) {
          const { replaced } = placed;
          const parentOfOthers = [...points.values()].some((x) => x.parent === replaced);
          // A kept point of another run stays until Forget: the new one joins beside it.
          const point = state.points[replaced];
          const kept = point?.kept && point.session !== session;
          if (!parentOfOthers && !kept && !heldElsewhere(state, entry.id, replaced)) {
            await analysis.remove([replaced]);
            history.getState().forget([replaced]);
          }
        }
        return analysis.append(generation, output, lease);
      },
    };
    const keep = (descriptor: D): WriteOutcome => {
      history.getState().add([descriptor], associateSources([{ entry, file }], file, descriptor));
      const outcome = placed ?? { kind: "duplicate" as const, id: descriptor.id };
      if (outcome.kind !== "duplicate") {
        const { parent } = outcome;
        history.setState((state) => ({
          points: {
            ...state.points,
            [descriptor.id]: { ...state.points[descriptor.id], parent, session },
          },
          sessions: { ...state.sessions, [session]: { entryId: entry.id, fileName: entry.name } },
        }));
      } else if (start) {
        // The opened file is a point already, such as a dropped copy: it starts the run.
        const adopted = adoptWatchStart(history.getState(), entry, session);
        if (adopted) history.setState(adopted);
      }
      return outcome;
    };
    try {
      analysis.claim(playthroughId);
      if (parsed) {
        try {
          return keep((await sink.append(analysis.generation(), parsed, lease)).descriptor);
        } catch (error) {
          if (error instanceof Error && error.name === MEMORY_LIMIT_ERROR)
            return { kind: "full", error: error.message };
          throw error;
        }
      }
      let outcome = null as WriteOutcome | null;
      const result = await importBatch([file], parser, sink, {
        signal: analysis.signal(),
        lease,
        concurrency: 1,
        refuseOutput: ({ descriptor }) => {
          if (descriptor.campaignId === playthroughId) return null;
          outcome = { kind: "otherCampaign" };
          return "belongs to another campaign";
        },
        onFileComplete: (completion) => {
          if ("descriptor" in completion) outcome = keep(completion.descriptor);
        },
      });
      if (outcome) return outcome;
      if (result.memoryFull) return { kind: "full", error: result.memoryFull };
      return { kind: "failed", error: result.failures[0]?.error ?? "The save could not be read." };
    } finally {
      lease.release();
    }
  };
}
