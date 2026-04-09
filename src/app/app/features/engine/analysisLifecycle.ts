type AnalysisTerminator = () => void;

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

export function terminateCurrentAnalysis(): void {
  const terminator = currentTerminator;
  currentTerminator = undefined;
  terminator?.terminate();
}
