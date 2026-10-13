import type { Eu5Store } from "./eu5Store";

export type Eu5LoadingState = {
  percent: number;
  stage: string;
};

/**
 * The status of the save on screen, named as in TanStack Query. A step keeps
 * its save on screen while the next save loads, as a refetch keeps its data.
 */
export type Eu5SessionSnapshot =
  /** A new map loads, so no save is on screen. */
  | { status: "pending"; progress: Eu5LoadingState }
  /** With `stepping`, a save of the campaign loads into the map on screen. */
  | { status: "success"; data: Eu5Store; stepping: boolean }
  | { status: "error"; error: unknown };

export const initialEu5SessionSnapshot: Eu5SessionSnapshot = {
  status: "pending",
  progress: { percent: 0, stage: "Starting workers" },
};
