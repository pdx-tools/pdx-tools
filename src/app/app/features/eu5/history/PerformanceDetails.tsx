import { useEffect, useState } from "react";
import { useEu5Engine, useEu5InsightPanelOpen } from "../store";
import type { AppEngine } from "../ui-engine";
import { useHistory } from "./store";

type Diagnostics = Awaited<ReturnType<AppEngine["trigger"]["getSnapshotDiagnostics"]>>;
const mib = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MiB`;

/** Sampling is active only while expanded and doesn't update the chart state. */
export function PerformanceDetails() {
  const engine = useEu5Engine();
  const panelVisible = useEu5InsightPanelOpen();
  const historyVisible = useHistory((s) => s.panelOpen);
  const timing = useHistory((s) => s.lastSwitch);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Diagnostics | null>(null);
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!open || !panelVisible || !historyVisible) return;
    let alive = true;
    let previous: { frames: number; time: number } | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const sample = async () => {
      try {
        const result = await engine.trigger.getSnapshotDiagnostics();
        if (!alive) return;
        const now = performance.now();
        if (previous)
          setFps(((result.map.renderedFrames - previous.frames) * 1000) / (now - previous.time));
        previous = { frames: result.map.renderedFrames, time: now };
        setData(result);
      } finally {
        if (alive) timer = setTimeout(() => void sample().catch(() => undefined), 2000);
      }
    };
    void sample().catch(() => undefined);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [engine, open, panelVisible, historyVisible]);
  return (
    <details
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-panel border border-game-line bg-game-panel-2 p-3"
    >
      <summary className="cursor-pointer text-[11px] text-game-ink-300">
        Performance monitor
      </summary>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[11px] text-game-ink-500">
        <dt>Save arenas · used / reserved</dt>
        <dd className="font-game-num text-game-ink-300">
          {data ? `${mib(data.game.saveArenaUsedBytes)} / ${mib(data.game.saveArenaBytes)}` : "…"}
        </dd>
        <dt>Game Wasm capacity</dt>
        <dd className="font-game-num">{data ? mib(data.game.wasmCapacityBytes) : "…"}</dd>
        <dt>Map Wasm capacity</dt>
        <dd className="font-game-num">{data ? mib(data.map.wasmCapacityBytes) : "…"}</dd>
        <dt>Cached full states</dt>
        <dd className="font-game-num">{data?.game.cachedStates ?? "…"} / 3</dd>
        <dt>Last saved-date switch</dt>
        <dd className="font-game-num">
          {timing
            ? `${timing.milliseconds.toFixed(1)} ms · ${timing.cacheHit ? "prepared" : "new"}`
            : "—"}
        </dd>
        <dt>Read / parse / workspace</dt>
        <dd className="font-game-num">
          {data?.game.lastPrepare
            ? `${data.game.lastPrepare.readMs.toFixed(0)} / ${data.game.lastPrepare.parseMs.toFixed(0)} / ${data.game.lastPrepare.workspaceMs.toFixed(0)} ms`
            : "—"}
        </dd>
        <dt>Map drawing</dt>
        <dd className="font-game-num">{fps.toFixed(1)} fps</dd>
      </dl>
      <p className="mt-3 text-[10px] leading-relaxed text-game-ink-500">
        Capacity includes reusable memory. Total browser RAM is measured separately. Sampling stops
        when this monitor is closed.
      </p>
    </details>
  );
}
