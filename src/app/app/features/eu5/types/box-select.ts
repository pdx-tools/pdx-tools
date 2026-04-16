export type BoxSelectOperation = "add" | "remove";

export type BoxSelectOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  operation: BoxSelectOperation;
};

export type BoxSelectCommitEvent = {
  locationIdxs: Uint32Array;
  add: boolean;
};
