import type { SnapshotDescriptor } from "./descriptor";
import type {
  AppendResult,
  ResidentMemory,
  ResidentSnapshot,
  ResidentStore,
} from "./residentStore";

/** The error name when an append belongs to a cleared or replaced session. */
export const STALE_GENERATION_ERROR = "AnalysisStaleGeneration";

export function staleGenerationError() {
  const error = Error("Campaign analysis was cleared during the import");
  error.name = STALE_GENERATION_ERROR;
  return error;
}

export type AppendReply<D> = AppendResult<D> & { memory: ResidentMemory };

/**
 * The worker methods of one analysis session: a resident store and its
 * generation.
 *
 * The main thread owns the generation. A clear or a new worker changes it,
 * so the session refuses an append from an import that started before.
 */
export function sessionApi<D extends SnapshotDescriptor, P>(store: ResidentStore<D, P>) {
  let generation = 0;
  return {
    /** The first call to a new worker. */
    open: (next: number) => {
      generation = next;
    },
    append: (
      requested: number,
      { descriptor, payload }: ResidentSnapshot<D, P>,
      limitBytes: number,
    ): AppendReply<D> => {
      if (requested !== generation) throw staleGenerationError();
      return { ...store.append(descriptor, payload, limitBytes), memory: store.memory() };
    },
    /** Release the snapshots of one campaign, or of all campaigns. */
    clear: (next: number, campaignId?: string): ResidentMemory => {
      generation = next;
      store.clear(campaignId);
      return store.memory();
    },
    memory: () => store.memory(),
  };
}

export type SessionApi<D extends SnapshotDescriptor, P> = ReturnType<typeof sessionApi<D, P>>;
