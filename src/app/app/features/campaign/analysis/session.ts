import type { SnapshotDescriptor } from "./descriptor";
import type { ResidentStore } from "./residentStore";

/** The error name when an append or a reply belongs to a cleared or replaced session. */
export const STALE_GENERATION_ERROR = "AnalysisStaleGeneration";

/** A query result and the session state that it used. */
export type QueryReply<T> = {
  generation: number;
  /** The snapshots that the query read, in date order. */
  snapshotIds: string[];
  value: T;
};

/** The session methods that the worker client calls. */
export type SessionControl = {
  open: (generation: number) => void;
  clear: (generation: number, campaignId?: string) => void;
  memory: () => ReturnType<ResidentStore<SnapshotDescriptor, unknown>["memory"]>;
};

/**
 * A resident store and its generation. The main thread sets the generation.
 * A clear or a new worker changes it, so the session refuses a late append.
 */
export class AnalysisSession<D extends SnapshotDescriptor, P> {
  private generation = 0;

  constructor(readonly store: ResidentStore<D, P>) {}

  append(generation: number, descriptor: D, payload: P) {
    if (generation !== this.generation) {
      const error = Error("Campaign analysis was cleared during the import");
      error.name = STALE_GENERATION_ERROR;
      throw error;
    }
    return this.store.append(descriptor, payload);
  }

  /** Read the campaign timeline one time, then run the query on that list. */
  query<T>(campaignId: string, run: (timeline: D[]) => T): QueryReply<T> {
    const timeline = this.store.timeline(campaignId);
    return {
      generation: this.generation,
      snapshotIds: timeline.map((descriptor) => descriptor.id),
      value: run(timeline),
    };
  }

  control(): SessionControl {
    return {
      open: (generation) => {
        this.generation = generation;
      },
      clear: (generation, campaignId) => {
        this.generation = generation;
        this.store.clear(campaignId);
      },
      memory: () => this.store.memory(),
    };
  }
}
