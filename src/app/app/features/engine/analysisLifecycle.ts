import type { SaveGameInput } from "./engineStore";

/**
 * A change of the engine input: the home page goes from the save `from`
 * to the save `to`. Null is no save.
 */
export type AnalysisChange = {
  from: SaveGameInput | null;
  to: SaveGameInput | null;
};

/**
 * Ends the analysis on screen because the engine input changes. Returns
 * false when the analysis continues. An analysis continues when it does
 * not show `from`, such as the analysis of an upload on its own route, or
 * when it continues into `to`, such as a step to the next save of a
 * campaign. The analysis then stays current.
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
