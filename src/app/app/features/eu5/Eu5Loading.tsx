import { useEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import type { Eu5LoadingState } from "./store";

const STAGE_DISCLOSURE_MS = 2500;

export const LOADING_DISSOLVE_MS = 220;

type Eu5LoadingProps = {
  loading: Eu5LoadingState | null;
  filename: string;
  done: boolean;
};

export function Eu5Loading({ loading, filename, done }: Eu5LoadingProps) {
  const { percent, stage } = useLatchedLoading(loading);
  const slow = useSlowParse(done);

  return (
    <div
      className={cx(
        "absolute inset-0 z-40 flex items-center justify-center bg-game-page px-6 font-game-ui",
        "transition-opacity ease-out motion-reduce:transition-none",
        done ? "pointer-events-none opacity-0" : "opacity-100",
      )}
      style={{ transitionDuration: `${LOADING_DISSOLVE_MS}ms` }}
      aria-hidden={done || undefined}
    >
      <div className="w-full max-w-[520px] pb-[8vh]">
        <div className="flex items-baseline justify-between gap-4">
          <p className="min-w-0 truncate text-[17px] leading-tight font-medium text-game-ink-100">
            {filename}
          </p>
          <p className="shrink-0 font-game-num text-[13px] text-game-ink-300 tabular-nums">
            {Math.round(percent)}%
          </p>
        </div>

        {/* Reserve space to avoid reflow. */}
        <p
          role="status"
          aria-live="polite"
          className={cx(
            "mt-3 h-3.5 font-game-num text-[10px] tracking-[0.14em] text-game-ink-500 uppercase",
            "transition-opacity duration-300 ease-out motion-reduce:transition-none",
            slow ? "opacity-100" : "opacity-0",
          )}
        >
          {slow ? stage : ""}
        </p>

        <div
          role="progressbar"
          aria-label="Parsing save file"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-1.5 h-1 w-full overflow-hidden rounded-[1px] border border-game-line bg-game-panel-2"
        >
          <div
            className="h-full rounded-[1px] bg-game-accent-300 transition-[width] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>

        <p className="mt-3 text-[11px] leading-[1.4] text-game-ink-500">
          Parsing locally in your browser.
        </p>
      </div>
    </div>
  );
}

/** Preserve the final progress value during fade-out. */
function useLatchedLoading(loading: Eu5LoadingState | null) {
  const latched = useRef({ percent: 0, stage: "" });
  if (loading) {
    latched.current = {
      percent: Math.max(0, Math.min(100, loading.percent)),
      stage: loading.stage,
    };
  }
  return latched.current;
}

function useSlowParse(done: boolean) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => setSlow(true), STAGE_DISCLOSURE_MS);
    return () => clearTimeout(timer);
  }, [done]);

  return slow;
}
