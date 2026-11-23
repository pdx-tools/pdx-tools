import type { DateComponents } from "@/features/timeline/date";
import type {
  CampaignAnalysisState,
  CampaignPoint,
  CampaignStoreStatus,
  FileVersionKey,
} from "./analysisState";
import { compareDescriptors, descriptorDate } from "./descriptor";
import type { SnapshotDescriptor } from "./descriptor";

/** Where a kept point came from. */
export type PointSource =
  | { kind: "watched"; name: string }
  | { kind: "dropped"; name: string }
  | { kind: "upload"; saveId: string };

/** A point as the main thread asks the worker to keep it. */
export type KeptPoint = {
  id: string;
  seq: number;
  date: DateComponents;
  parent: string | null;
  session: string | null;
  source: PointSource;
  sourceKeys: FileVersionKey[];
};

/** A kept point in the index, with its figures file. */
export type IndexPoint = KeptPoint & {
  /** Null when its figures are missing or could not be read. */
  snapshot: { file: string; encoder: number; bytes: number } | null;
  /** A copy of the save file, with Keep files on. */
  saveFile: { file: string; bytes: number } | null;
};

export type IndexSession = { id: string; fileName: string; startedSeq: number };

/** What this browser keeps of one campaign, in `campaigns/<playthroughId>/`. */
export type CampaignIndexContent = {
  format: 1;
  game: string;
  playthroughId: string;
  keepFiles: boolean;
  nextSeq: number;
  sessions: IndexSession[];
  points: IndexPoint[];
};

/** Two copies alternate; the higher valid `writeSeq` wins. */
export type CampaignIndex = { format: 1; writeSeq: number; checksum: string } & Omit<
  CampaignIndexContent,
  "format"
>;

export type PersistRequest = Pick<CampaignIndexContent, "nextSeq" | "sessions"> & {
  points: KeptPoint[];
};

export type RestoreReply<D> =
  | { status: "none" | "unreadable" }
  | {
      status: "ok";
      content: CampaignIndexContent;
      /** The descriptors of the points that the store holds now. */
      descriptors: D[];
      /** Points whose figures could not be read. */
      missing: string[];
      /** The analysis bound stopped the restore. */
      full: boolean;
    };

export type PersistReply =
  /** `ids` are the points in the index; `missing` counts those whose figures could not be read. */
  | {
      status: "written" | "unchanged" | "full";
      kept: number;
      ids: string[];
      missing: number;
    }
  | { status: "readOnly" };

/** The hex SHA-256 of a text. */
async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** An index of content, at `writeSeq`, with the checksum over the rest of it. */
export async function sealIndex(
  content: CampaignIndexContent,
  writeSeq: number,
): Promise<CampaignIndex> {
  const { format, ...rest } = content;
  const checksum = await sha256(JSON.stringify({ format, writeSeq, ...rest }));
  return { format, writeSeq, checksum, ...rest };
}

/** The index that a load uses: the newest valid copy, or null when neither is valid. */
export async function pickIndex(copies: readonly (string | null)[]): Promise<CampaignIndex | null> {
  let best: CampaignIndex | null = null;
  for (const text of copies) {
    if (text === null) continue;
    try {
      const parsed = JSON.parse(text) as CampaignIndex;
      const { checksum, ...rest } = parsed;
      if (parsed.format !== 1 || checksum !== (await sha256(JSON.stringify(rest)))) continue;
      if (!best || parsed.writeSeq > best.writeSeq) best = parsed;
    } catch {
      // A copy cut short by a crash; the other one is used.
    }
  }
  return best;
}

/** The content of an index, without its write sequence and checksum. */
export function indexContent({ writeSeq: _seq, checksum: _sum, ...rest }: CampaignIndex) {
  return rest satisfies CampaignIndexContent;
}

/** The points of the campaign as the main thread asks the worker to keep them. */
export function persistRequest(
  state: Pick<CampaignAnalysisState, "snapshots" | "points" | "sessions" | "uploads" | "nextSeq">,
  campaignId: string,
): PersistRequest {
  const uploads = new Map(
    Object.entries(state.uploads).flatMap(([saveId, x]) =>
      x.kind === "ready" ? [[x.snapshotId, saveId] as const] : [],
    ),
  );
  const points = state.snapshots.flatMap((snapshot): KeptPoint[] => {
    const point = state.points[snapshot.id];
    if (!point || snapshot.campaignId !== campaignId) return [];
    const name = point.sourceKeys.at(-1)?.name ?? "";
    const upload = uploads.get(snapshot.id);
    // A point of an earlier visit keeps the source that the store recorded.
    const source: PointSource =
      point.source ??
      (point.session !== null
        ? { kind: "watched", name: state.sessions[point.session]?.fileName ?? name }
        : upload
          ? { kind: "upload", saveId: upload }
          : { kind: "dropped", name });
    const { seq, parent, session, sourceKeys } = point;
    return [
      { id: snapshot.id, seq, date: descriptorDate(snapshot), parent, session, source, sourceKeys },
    ];
  });
  // Only the runs that a kept point belongs to.
  const sessions = Object.entries(state.sessions).flatMap(([id, x]) => {
    const run = points.filter((p) => p.session === id);
    return run.length
      ? [{ id, fileName: x.fileName, startedSeq: Math.min(...run.map((p) => p.seq)) }]
      : [];
  });
  return { nextSeq: state.nextSeq, sessions, points };
}

/**
 * Join the points of earlier visits to this visit's. They are seen before
 * this visit's points, and their watch runs belong to no file of this tab.
 */
export function mergeRestored<D extends SnapshotDescriptor>(
  state: Pick<CampaignAnalysisState<D>, "snapshots" | "points" | "sessions" | "nextSeq">,
  content: CampaignIndexContent,
  descriptors: readonly D[],
): Pick<CampaignAnalysisState<D>, "snapshots" | "points" | "sessions" | "nextSeq"> {
  const byId = new Map(state.snapshots.map((x) => [x.id, x]));
  for (const descriptor of descriptors)
    if (!byId.has(descriptor.id)) byId.set(descriptor.id, descriptor);
  const shift = content.nextSeq;
  const points: Record<string, CampaignPoint> = {};
  for (const [id, point] of Object.entries(state.points))
    points[id] = { ...point, seq: point.seq + shift };
  for (const kept of content.points) {
    if (!byId.has(kept.id)) continue;
    const now = points[kept.id];
    const keys = [...kept.sourceKeys];
    for (const key of now?.sourceKeys ?? [])
      if (
        !keys.some(
          (x) => x.name === key.name && x.size === key.size && x.lastModified === key.lastModified,
        )
      )
        keys.push(key);
    points[kept.id] = {
      seq: kept.seq,
      parent: kept.parent,
      session: kept.session,
      sourceKeys: keys,
      kept: true,
      source: kept.source,
    };
  }
  const sessions = { ...state.sessions };
  for (const x of content.sessions)
    sessions[x.id] ??= { entryId: null, fileName: x.fileName, restored: true };
  return {
    snapshots: [...byId.values()].sort(compareDescriptors),
    points,
    sessions,
    nextSeq: state.nextSeq + shift,
  };
}

/** Mark the points that the store wrote, so only Forget removes them. Unchanged when none is new. */
export function markKept(
  points: CampaignAnalysisState["points"],
  ids: readonly string[],
): CampaignAnalysisState["points"] {
  const fresh = ids.filter((id) => points[id] && !points[id].kept);
  if (!fresh.length) return points;
  const next = { ...points };
  for (const id of fresh) next[id] = { ...next[id], kept: true };
  return next;
}

/**
 * What the campaign's footer says of the store: where the points are kept
 * and Forget, when any are, and that new ones are not, when the store is full.
 */
export function storeFooter(stored: CampaignStoreStatus | null) {
  if (!stored || stored.state === "unavailable") return null;
  const unreadable = stored.state === "unreadable";
  const kept = stored.kept > 0;
  const full = stored.state === "full";
  if (!unreadable && !kept && !full) return null;
  return { unreadable, kept, full, forget: unreadable || kept };
}
