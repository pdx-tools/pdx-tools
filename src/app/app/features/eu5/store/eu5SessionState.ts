import type { Eu5Store } from "./eu5Store";

export type Eu5LoadingState = {
  percent: number;
  stage: string;
};

export type Eu5SessionSnapshot = {
  /** The save on screen until the next save is ready. */
  data: Eu5Store | null;
  /** The progress of a load that starts a new map. */
  loading: Eu5LoadingState | null;
  /** A save of the campaign loads into the map on screen. */
  stepping: boolean;
  error: unknown;
};

export const initialEu5SessionSnapshot: Eu5SessionSnapshot = {
  data: null,
  loading: { percent: 0, stage: "Starting workers" },
  stepping: false,
  error: null,
};
