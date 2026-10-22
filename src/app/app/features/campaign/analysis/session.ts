import type { AnalysisErrorName, Selection, StoreMemory } from "@/wasm/wasm_eu5";
import type { SnapshotDescriptor } from "./descriptor";

/** The error name when an append belongs to a cleared or replaced session. */
export const STALE_GENERATION_ERROR = "AnalysisStaleGeneration" satisfies AnalysisErrorName;

/** The error name when a snapshot does not fit in the memory limit. */
export const MEMORY_LIMIT_ERROR = "AnalysisMemoryLimit" satisfies AnalysisErrorName;

export function staleGenerationError() {
  const error = Error("Campaign analysis was cleared during the import");
  error.name = STALE_GENERATION_ERROR;
  return error;
}

export type ResidentMemory = StoreMemory;
export type SnapshotSelection = Selection;

/**
 * The store class that `campaign_analysis::wasm_store!` declares for a game.
 * Rust keeps the snapshots, the generation and the queries. The types of a
 * game come from its class: see `DescriptorOf`, `SnapshotOf` and `QueryOf`.
 */
export type AnalysisStore = {
  open(generation: number): void;
  append(
    generation: number,
    data: never,
    limitBytes: number,
  ): { descriptor: SnapshotDescriptor; duplicate: boolean; memory: StoreMemory };
  clear(generation: number, campaignId?: string | null): StoreMemory;
  query(request: never): {
    generation: number;
    snapshotIds: string[];
    outcome: { status: "ok"; answer: { kind: string; value: unknown } } | { status: "stale" };
  };
  snapshot(id: string): { descriptor: SnapshotDescriptor; data: Uint8Array<ArrayBuffer> };
  memory(): StoreMemory;
};

export type DescriptorOf<S extends AnalysisStore> = ReturnType<S["append"]>["descriptor"];
/** A parsed save of the game of `S`: its descriptor and its opaque binary form. */
export type SnapshotOf<S extends AnalysisStore> = ReturnType<S["snapshot"]>;
export type AppendReplyOf<S extends AnalysisStore> = ReturnType<S["append"]>;
export type QueryOf<S extends AnalysisStore> = Parameters<S["query"]>[0]["query"];
type AnswerOf<S extends AnalysisStore> = Extract<
  ReturnType<S["query"]>["outcome"],
  { status: "ok" }
>["answer"];
/** The answer of a query kind. Rust gives each query the answer of its kind. */
export type AnswerValue<S extends AnalysisStore, K> = Extract<AnswerOf<S>, { kind: K }>["value"];

export type QueryOutcome<T> =
  | { status: "ok"; value: T }
  /** The request is from another session generation. */
  | { status: "stale" };

export type QueryReply<T> = {
  generation: number;
  /** The query and its arguments, as the subscriber identifies them. */
  identity: string;
  sequence: number;
  /** The snapshots that the query read, in date order. */
  snapshotIds: string[];
  outcome: QueryOutcome<T>;
};

const METHODS = ["open", "append", "clear", "query", "snapshot", "memory"] as const;
type Method = (typeof METHODS)[number];
type Async<S> = {
  [K in keyof S]: S[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<R> : never;
};

/**
 * The worker methods of one analysis session. Each call waits for the WASM
 * module and then goes to the Rust store without a change.
 */
export function sessionApi<S extends AnalysisStore>(opened: Promise<S>) {
  const forward =
    (method: Method) =>
    async (...args: unknown[]) => {
      const store = await opened;
      return (store[method] as (...args: unknown[]) => unknown).apply(store, args);
    };
  return Object.fromEntries(METHODS.map((method) => [method, forward(method)])) as Async<
    Pick<S, Method>
  >;
}

export type SessionApi<S extends AnalysisStore> = ReturnType<typeof sessionApi<S>>;
