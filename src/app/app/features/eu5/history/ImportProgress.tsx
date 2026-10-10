import { useEffect, useState } from "react";

export type ImportProgressState = {
  completed: number;
  total: number;
  startedAt: number;
  fileName?: string;
};

export function importProgressStats(completed: number, total: number, elapsedMs: number) {
  const processed = Math.max(0, Math.min(completed, total));
  return {
    percent: total > 0 ? Math.floor((processed / total) * 100) : 0,
    etaSeconds:
      processed > 0 && total > 0
        ? Math.ceil(((Math.max(0, elapsedMs) / processed) * (total - processed)) / 1000)
        : null,
  };
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function ImportProgress({
  progress,
  onCancel,
  light = false,
}: {
  progress: ImportProgressState;
  onCancel: () => void;
  light?: boolean;
}) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const { percent, etaSeconds } = importProgressStats(
    progress.completed,
    progress.total,
    Math.max(now, performance.now()) - progress.startedAt,
  );
  return (
    <div className={`w-full min-w-0 text-xs ${light ? "text-white" : "text-game-ink-300"}`}>
      <div role="status" className="mb-2 flex flex-wrap justify-between gap-2">
        <span>
          Importing saves · {progress.completed}/{progress.total} · {percent}%
        </span>
        <span>
          {etaSeconds == null
            ? "Estimating time remaining…"
            : progress.completed === progress.total
              ? "Finishing…"
              : `About ${duration(etaSeconds)} remaining`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="EU5 save import"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className={`h-2 overflow-hidden rounded-full ${light ? "bg-white/20" : "bg-game-panel-2"}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${light ? "bg-emerald-300" : "bg-game-accent-100"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">{progress.fileName ?? "Preparing import…"}</span>
        <button onClick={onCancel} className="shrink-0 underline">
          Stop import
        </button>
      </div>
    </div>
  );
}
