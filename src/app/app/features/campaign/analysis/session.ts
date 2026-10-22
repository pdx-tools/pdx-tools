import type { SnapshotDescriptor } from "./descriptor";

/** The error name when an append belongs to a cleared or replaced session. */
export const STALE_GENERATION_ERROR = "AnalysisStaleGeneration";

/** The error name when a snapshot does not fit in the memory limit. */
export const MEMORY_LIMIT_ERROR = "AnalysisMemoryLimit";

export function staleGenerationError() {
  const error = Error("Campaign analysis was cleared during the import");
  error.name = STALE_GENERATION_ERROR;
  return error;
}

/** The output of a reader worker for one save. */
export type ResidentSnapshot<D, P> = { descriptor: D; payload: P };
export type AppendResult<D> = { descriptor: D; duplicate: boolean };

export type ResidentMemory = {
  /** Strict: the bytes of the payloads and the layout IDs, each layout once. */
  bufferBytes: number;
  snapshots: number;
  layouts: number;
  /** An estimate of the row indexes of the layouts. It is not part of the limit. */
  indexBytes: number;
  /** The WASM memory of the worker. It does not shrink until the worker stops. */
  wasmBytes: number;
};

export type AppendReply<D> = AppendResult<D> & { memory: ResidentMemory };

export type SnapshotSelection = { kind: "all" } | { kind: "ids"; ids: string[] };

/**
 * The Rust store of a game in its analysis worker. It keeps one campaign.
 * Its append throws an error named `MEMORY_LIMIT_ERROR` when the snapshot
 * does not fit.
 */
export type AnalysisStore<D, P> = {
  append(
    descriptor: D,
    payload: P,
    limitBytes: number,
  ): { descriptor: SnapshotDescriptor; duplicate: boolean };
  clear(): void;
  campaign(): string | undefined;
  memory(): Omit<ResidentMemory, "wasmBytes">;
  /** The IDs of the selected snapshots of a campaign, in date order. */
  select(campaignId: string, selection: SnapshotSelection): string[];
};

export type QueryContext<S> = {
  store: S;
  campaignId: string;
  /** The session reads the snapshot IDs of this selection one time. */
  selection: SnapshotSelection;
};

export type QueryHandlers<S> = Record<string, (context: QueryContext<S>, args: never) => unknown>;

export type QueryOf<H> = {
  [K in keyof H & string]: H[K] extends (context: never, args: infer A) => unknown
    ? { kind: K; args: A }
    : never;
}[keyof H & string];

export type ResultOf<H, Q extends { kind: keyof H }> = H[Q["kind"]] extends (
  ...args: never[]
) => infer R
  ? R
  : never;

export type QueryRequest<Q> = {
  generation: number;
  campaignId: string;
  selection: SnapshotSelection;
  /** The query and its arguments, as the subscriber identifies them. */
  identity: string;
  sequence: number;
  query: Q;
};

export type QueryOutcome<T> =
  | { status: "ok"; value: T }
  /** The request is from another session generation. */
  | { status: "stale" }
  | { status: "unsupported"; kind: string };

export type QueryReply<T> = {
  generation: number;
  identity: string;
  sequence: number;
  /** The snapshots that the query read, in date order. */
  snapshotIds: string[];
  outcome: QueryOutcome<T>;
};

/**
 * The worker methods of one analysis session: the Rust store of the game,
 * its generation and the query handlers of the game.
 *
 * The main thread owns the generation. A clear or a new worker changes it,
 * so the session refuses an append from an import that started before, and
 * a query from before gets a stale outcome.
 */
export function sessionApi<
  D extends SnapshotDescriptor,
  P,
  S extends AnalysisStore<D, P>,
  H extends QueryHandlers<S>,
>(opened: Promise<S>, handlers: H, wasmBytes: () => number = () => 0) {
  let generation = 0;
  const memory = (store: S): ResidentMemory => ({ ...store.memory(), wasmBytes: wasmBytes() });
  return {
    /** The first call to a new worker. It resolves when the store is ready. */
    open: async (next: number) => {
      generation = next;
      await opened;
    },
    append: async (
      requested: number,
      { descriptor, payload }: ResidentSnapshot<D, P>,
      limitBytes: number,
    ): Promise<AppendReply<D>> => {
      const store = await opened;
      if (requested !== generation) throw staleGenerationError();
      const result = store.append(descriptor, payload, limitBytes);
      // The store gives back the descriptor that it received for this ID.
      return {
        descriptor: result.descriptor as D,
        duplicate: result.duplicate,
        memory: memory(store),
      };
    },
    /** Release the snapshots of the campaign. Another campaign has none to release. */
    clear: async (next: number, campaignId?: string): Promise<ResidentMemory> => {
      generation = next;
      const store = await opened;
      if (campaignId === undefined || store.campaign() === campaignId) store.clear();
      return memory(store);
    },
    query: async (request: QueryRequest<QueryOf<H>>): Promise<QueryReply<unknown>> => {
      const store = await opened;
      const { identity, sequence, campaignId, selection } = request;
      const reply = { generation, identity, sequence };
      if (request.generation !== generation)
        return { ...reply, snapshotIds: [], outcome: { status: "stale" } };
      const { kind, args } = request.query;
      if (!Object.hasOwn(handlers, kind))
        return { ...reply, snapshotIds: [], outcome: { status: "unsupported", kind } };
      const snapshotIds = store.select(campaignId, selection);
      const handler: QueryHandlers<S>[string] = handlers[kind];
      // The query type gives each kind the arguments of its handler.
      const value = handler({ store, campaignId, selection }, args as never);
      return { ...reply, snapshotIds, outcome: { status: "ok", value } };
    },
    memory: async () => memory(await opened),
  };
}

export type SessionApi<
  D extends SnapshotDescriptor,
  P,
  S extends AnalysisStore<D, P> = AnalysisStore<D, P>,
  H extends QueryHandlers<S> = QueryHandlers<S>,
> = ReturnType<typeof sessionApi<D, P, S, H>>;
