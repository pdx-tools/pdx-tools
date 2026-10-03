import type { SaveGameInput } from "./engineStore";

/**
 * Ends the analysis on screen because the page goes to `next`, or to no
 * save when it is null. Returns false when the analysis continues into
 * `next`, such as a step to the next save of a campaign; the analysis then
 * stays current.
 */
type AnalysisTerminator = (next: SaveGameInput | null) => boolean;

let currentTerminator:
  | {
      token: symbol;
      terminate: AnalysisTerminator;
    }
  | undefined;

export function registerAnalysisTerminator(terminate: AnalysisTerminator): () => void {
  const token = Symbol("analysis terminator");
  currentTerminator = { token, terminate };

  return () => {
    if (currentTerminator?.token === token) {
      currentTerminator = undefined;
    }
  };
}

/** Returns true when the analysis on screen continues into `next`. */
export function terminateCurrentAnalysis(next: SaveGameInput | null = null): boolean {
  const terminator = currentTerminator;
  if (terminator === undefined) {
    return false;
  }

  if (!terminator.terminate(next)) {
    return true;
  }

  if (currentTerminator?.token === terminator.token) {
    currentTerminator = undefined;
  }
  return false;
}
