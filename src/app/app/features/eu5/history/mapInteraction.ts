import type { LocationClickChangeEvent } from "../workers/map/map-module";
import type { BoxSelectCommitEvent } from "../types/box-select";

/** Replay the original gesture after loading the rich model for a previewed date. */
export type MapInteraction =
  | { kind: "click"; event: LocationClickChangeEvent }
  | { kind: "box"; event: BoxSelectCommitEvent }
  | { kind: "command"; name: string; args: number[] };
