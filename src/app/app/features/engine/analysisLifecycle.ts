import type { SaveGameInput } from "./engineStore";

/** The previous and next inputs of the home page analysis. */
export type AnalysisChange = {
  from: SaveGameInput | null;
  to: SaveGameInput | null;
};

/**
 * Return true when an input change ends this analysis.
 * An analysis that serves another route or continues into the next input stays active.
 */
type AnalysisTerminator = (change: AnalysisChange) => boolean;

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

export function terminateCurrentAnalysis(change: AnalysisChange): void {
  const terminator = currentTerminator;
  if (terminator === undefined || !terminator.terminate(change)) {
    return;
  }

  if (currentTerminator?.token === terminator.token) {
    currentTerminator = undefined;
  }
}
