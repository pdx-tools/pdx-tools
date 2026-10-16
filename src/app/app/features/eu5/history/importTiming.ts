export type ImportPhaseState = {
  phase: "import";
  completed: number;
  total: number;
  startedAt: number;
  concurrency?: number;
};

export type ImportProgressState = {
  completed: number;
  total: number;
  startedAt: number;
  fileName?: string;
  phase?: ImportPhaseState;
};

export function importProgressStats(
  completed: number,
  total: number,
  elapsedMs: number,
  concurrency = 1,
) {
  const processed = Math.max(0, Math.min(completed, total));
  return {
    percent: total > 0 ? Math.floor((processed / total) * 100) : 0,
    etaSeconds:
      processed > 0 && total > 0 && processed >= Math.min(concurrency, total)
        ? Math.ceil(((Math.max(0, elapsedMs) / processed) * (total - processed)) / 1000)
        : null,
  };
}
