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
 * The TypeScript types of the store of one game, as `wasm_store!` generates
 * them. Rust keeps the snapshots, the generation and the queries.
 */
export type StoreTypes = {
  descriptor: SnapshotDescriptor;
  /** The opaque binary form of a snapshot. Only Rust reads it. */
  data: Uint8Array<ArrayBuffer>;
  query: { kind: string };
  /** Each query gets the answer of its own kind. */
  answer: { kind: string; value: unknown };
};

/** A parsed save: its descriptor and its binary form. */
export type EncodedSnapshot<T extends StoreTypes> = {
  descriptor: T["descriptor"];
  data: T["data"];
};

export type StoreQueryRequest<T extends StoreTypes> = {
  generation: number;
  campaignId: string;
  selection?: Selection;
  query: T["query"];
};

export type StoreQueryReply<T extends StoreTypes> = {
  generation: number;
  snapshotIds: string[];
  outcome: { status: "ok"; answer: T["answer"] } | { status: "stale" };
};

export type StoreAppendReply<T extends StoreTypes> = {
  descriptor: T["descriptor"];
  duplicate: boolean;
  memory: StoreMemory;
};

/** The store class that `campaign_analysis::wasm_store!` declares for a game. */
export type AnalysisStore<T extends StoreTypes = StoreTypes> = {
  open(generation: number): void;
  append(generation: number, data: T["data"], limitBytes: number): StoreAppendReply<T>;
  clear(generation: number): StoreMemory;
  query(request: StoreQueryRequest<T>): StoreQueryReply<T>;
  snapshot(id: string): EncodedSnapshot<T>;
  memory(): StoreMemory;
};

/** The types of a generated store class. */
export type TypesOf<S> = S extends {
  append(
    generation: number,
    data: infer B extends Uint8Array<ArrayBuffer>,
    limitBytes: number,
  ): { descriptor: infer D extends SnapshotDescriptor };
  query(request: { query: infer Q extends { kind: string } }): {
    outcome: { status: "ok"; answer: infer A extends { kind: string; value: unknown } } | object;
  };
}
  ? { descriptor: D; data: B; query: Q; answer: A }
  : never;

export type DescriptorOf<S> = TypesOf<S>["descriptor"];
/** A parsed save of the game of `S`: its descriptor and its opaque binary form. */
export type SnapshotOf<S> = EncodedSnapshot<TypesOf<S>>;
export type QueryOf<S> = TypesOf<S>["query"];
/** The answer of a query kind. */
export type AnswerValue<T extends StoreTypes, K> = Extract<T["answer"], { kind: K }>["value"];

/** True when an answer has the kind of its query. Rust always gives that kind. */
export function isAnswerOf<A extends { kind: string }, K extends string>(
  answer: A,
  kind: K,
): answer is Extract<A, { kind: K }> {
  return answer.kind === kind;
}

/** The worker methods of a store, as the main thread calls them. */
export type StoreApi<T extends StoreTypes> = Async<AnalysisStore<T>>;

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
/** The methods of `S`, as a call through a worker gives them. */
export type Async<S> = {
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
