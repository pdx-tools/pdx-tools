export type BoxSelectOperation = "add" | "remove" | "replace";

export type BoxSelectOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  operation: BoxSelectOperation;
};

export type BoxSelectCommitEvent = {
  locationIdxs: Uint32Array;
  operation: BoxSelectOperation;
};
