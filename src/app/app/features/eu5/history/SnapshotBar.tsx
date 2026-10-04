import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/24/solid";
import { GameButton } from "@/components/game/Button";
import { useSnapshotSwitch } from "./useSnapshotSwitch";
import {
  useEu5Engine,
  useEu5MapMode,
  useEu5SaveInput,
  useSetEu5TimelineBarHeight,
  useSetEu5InsightPanelOpen,
} from "../store";
import { useViewportInsets } from "../useViewportInsets";
import { useHistory } from "./store";
import { campaignKey } from "./types";

export function SnapshotBar() {
  const history = useHistory();
  const input = useEu5SaveInput();
  const engine = useEu5Engine();
  const mode = useEu5MapMode();
  const insets = useViewportInsets();
  const switchSnapshot = useSnapshotSwitch();
  const setHeight = useSetEu5TimelineBarHeight();
  const setPanelOpen = useSetEu5InsightPanelOpen();
  const restored = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const selected = history.snapshots.find((s) => s.hash === history.selectedHash);
  const active = !!selected && input.kind === "file" && history.files[selected.hash] === input.file;
  const dates =
    active && selected
      ? history.snapshots.filter((s) => campaignKey(s) === campaignKey(selected))
      : [];
  const index = dates.findIndex((s) => s.hash === selected?.hash);
  const [draft, setDraft] = useState(index);
  useEffect(() => {
    setDraft(index);
  }, [index]);
  useEffect(() => {
    if (!active) return;
    setPanelOpen(history.insightOpen);
    let alive = true;
    void engine.trigger.selectMapMode(history.mapMode).then(() => {
      if (alive) {
        restored.current = true;
        useHistory.getState().rememberMode(engine.getState().currentMapMode);
      }
    });
    return () => {
      alive = false;
    };
  }, [engine, active]);
  useEffect(() => {
    if (active && restored.current) history.rememberMode(mode);
  }, [mode, active, history.rememberMode]);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const report = () => setHeight(el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => {
      observer.disconnect();
      setHeight(0);
    };
  }, [setHeight]);
  const choose = (i: number) => {
    const snapshot = dates[i];
    const file = snapshot && history.files[snapshot.hash];
    if (!file || snapshot.hash === selected?.hash) return;
    if (history.switching) return;
    void switchSnapshot(snapshot.hash);
  };
  useEffect(() => {
    if (!history.playing || !active || history.switching) return;
    if (index >= dates.length - 1 || !history.files[dates[index + 1]?.hash]) {
      history.setPlaying(false);
      return;
    }
    const timer = setTimeout(() => choose(index + 1), 1200);
    return () => clearTimeout(timer);
  }, [history.playing, history.switching, active, index, selected?.hash, engine]);
  useEffect(() => {
    if (!active || history.switching) return;
    const next = dates[index + 1];
    const file = next && history.files[next.hash];
    if (file)
      void engine.trigger.prepareSnapshot(file, next.hash).catch(() => {
        // A direct switch reports parse errors and retains the current rendered state.
      });
  }, [engine, active, selected?.hash, dates.length, history.switching]);
  const openHistory = () => {
    history.showPanel(true);
    setPanelOpen(true);
  };
  // Use elapsed time on the track; snap to actual saved observations on release.
  const times = dates.map((s) => Date.parse(`${s.date}T00:00:00Z`));
  const nearest = (time: number) =>
    times.reduce((best, t, i) => (Math.abs(t - time) < Math.abs(times[best] - time) ? i : best), 0);
  const commit = () => {
    history.setPlaying(false);
    choose(draft);
  };
  return (
    <div
      ref={barRef}
      className="@container pointer-events-auto absolute z-20 font-game-ui"
      style={{ left: insets.left + 16, right: insets.right + 16, bottom: 16 }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border border-game-line-strong bg-game-overlay py-2 pr-2 pl-2.5 shadow-xl backdrop-blur-md">
        {active ? (
          <>
            <div className="flex items-center gap-0.5">
              <GameButton
                variant="icon"
                aria-label="Previous saved snapshot"
                disabled={history.switching || index <= 0 || !history.files[dates[index - 1]?.hash]}
                onClick={() => {
                  history.setPlaying(false);
                  choose(index - 1);
                }}
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </GameButton>
              <GameButton
                variant="icon"
                aria-label={history.playing ? "Pause saved timeline" : "Play saved timeline"}
                disabled={history.switching || dates.length < 2 || index >= dates.length - 1}
                onClick={() => history.setPlaying(!history.playing)}
              >
                {history.playing ? (
                  <PauseIcon className="h-4 w-4" />
                ) : (
                  <PlayIcon className="h-4 w-4" />
                )}
              </GameButton>
              <GameButton
                variant="icon"
                aria-label="Next saved snapshot"
                disabled={
                  history.switching ||
                  index >= dates.length - 1 ||
                  !history.files[dates[index + 1]?.hash]
                }
                onClick={() => {
                  history.setPlaying(false);
                  choose(index + 1);
                }}
              >
                <ChevronRightIcon className="h-4 w-4" />
              </GameButton>
            </div>
            <div className="shrink-0 font-game-num">
              <div className="text-[12px] text-game-ink-100">
                {dates[draft]?.date ?? selected?.date}
              </div>
              <div className="text-[9px] tracking-wide text-game-ink-500">
                {index + 1}/{dates.length} saved dates
              </div>
            </div>
            <div className="relative min-w-0 flex-1 basis-48 @max-xl:order-first @max-xl:basis-full">
              <input
                aria-label="Saved snapshot date"
                type="range"
                min={times[0] ?? 0}
                max={Math.max((times[0] ?? 0) + 1, times.at(-1) ?? 1)}
                step={86400000}
                value={times[draft] ?? times[index] ?? 0}
                disabled={history.switching || dates.length < 2}
                className="block w-full cursor-pointer accent-game-accent-100"
                onChange={(e) => setDraft(nearest(Number(e.target.value)))}
                onPointerUp={commit}
                onKeyUp={commit}
                onBlur={commit}
                onPointerCancel={() => setDraft(index)}
              />
              <div className="flex justify-between font-game-num text-[9px] text-game-ink-500">
                <span>{dates[0]?.date}</span>
                <span>{dates.at(-1)?.date}</span>
              </div>
            </div>
            {mode === "political" ? (
              <GameButton
                variant="ghost"
                onClick={() => {
                  history.setPlaying(false);
                  history.setTimelineSource("ownership");
                }}
              >
                Ownership history
              </GameButton>
            ) : null}
          </>
        ) : (
          <span className="text-[11px] text-game-ink-500">
            Compare this view across saved dates
          </span>
        )}
        {history.switching ? (
          <span role="status" className="text-[10px] text-game-ink-500">
            Preparing date…
          </span>
        ) : null}
        {history.switchError ? (
          <span
            role="alert"
            className="max-w-48 truncate text-[10px] text-game-ink-300"
            title={history.switchError}
          >
            Date unavailable
          </span>
        ) : null}
        <GameButton variant="ghost" onClick={openHistory}>
          <ClockIcon className="h-4 w-4" />
          {active ? "Over time" : "Add saved dates"}
        </GameButton>
      </div>
    </div>
  );
}

export function useHasSnapshotTimeline(): boolean {
  const { selectedHash, snapshots, files } = useHistory();
  const input = useEu5SaveInput();
  return !!snapshots.find(
    (s) => s.hash === selectedHash && input.kind === "file" && files[s.hash] === input.file,
  );
}
