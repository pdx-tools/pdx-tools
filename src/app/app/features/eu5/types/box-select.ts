import type { SelectionOp } from "@/wasm/wasm_eu5";

export type BoxSelectOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  operation: SelectionOp;
};

export type BoxSelectCommitEvent = {
  locationIdxs: Uint32Array;
  operation: SelectionOp;
};
