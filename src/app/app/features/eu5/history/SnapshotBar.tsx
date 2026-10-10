import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
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

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;

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
  const dates = useMemo(
    () =>
      active && selected
        ? history.snapshots.filter((s) => campaignKey(s) === campaignKey(selected))
        : [],
    [active, selected, history.snapshots],
  );
  const index = dates.findIndex((s) => s.hash === selected?.hash);
  const speedIndex = PLAYBACK_SPEEDS.indexOf(
    history.playbackSpeed as (typeof PLAYBACK_SPEEDS)[number],
  );
  const [draftState, setDraftState] = useState({ index, value: index });
  const draft = draftState.index === index ? draftState.value : index;
  const setDraft = (value: number) => setDraftState({ index, value });
  if (draftState.index !== index) setDraftState({ index, value: index });
  useEffect(() => {
    if (!active) return;
    const remembered = useHistory.getState();
    setPanelOpen(remembered.insightOpen);
    let alive = true;
    void engine.trigger.selectMapMode(remembered.mapMode).then(() => {
      if (alive) {
        restored.current = true;
        useHistory.getState().rememberMode(engine.getState().currentMapMode);
      }
    });
    return () => {
      alive = false;
    };
  }, [engine, active, setPanelOpen]);
  const rememberMode = history.rememberMode;
  useEffect(() => {
    if (active && restored.current) rememberMode(mode);
  }, [mode, active, rememberMode]);
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
  const nextIndex = dates.findIndex(
    (s, i) => i > index && !!history.files[s.hash] && !history.failedSnapshots[s.hash],
  );
  const previousIndex = dates.findLastIndex(
    (s, i) => i < index && !!history.files[s.hash] && !history.failedSnapshots[s.hash],
  );
  const choose = useCallback(
    (i: number) => {
      const snapshot = dates[i];
      const file = snapshot && history.files[snapshot.hash];
      if (!file || snapshot.hash === selected?.hash) return;
      if (history.switching) return;
      void switchSnapshot(snapshot.hash);
    },
    [dates, history.files, history.switching, selected?.hash, switchSnapshot],
  );
  useEffect(() => {
    if (!history.playing || !active || history.switching) return;
    if (nextIndex < 0) {
      useHistory.getState().setPlaying(false);
      return;
    }
    const timer = setTimeout(() => choose(nextIndex), 1200 / history.playbackSpeed);
    return () => clearTimeout(timer);
  }, [
    history.playing,
    history.playbackSpeed,
    history.switching,
    choose,
    nextIndex,
    active,
    index,
    selected?.hash,
    engine,
  ]);
  useEffect(() => {
    if (!active || history.switching) return;
    let cancelled = false;
    const upcoming = dates
      .filter((s, i) => i > index && history.files[s.hash] && !history.failedSnapshots[s.hash])
      .slice(0, history.playing && history.playbackSpeed >= 2 ? 2 : 1);
    void (async () => {
      for (const [offset, snapshot] of upcoming.entries()) {
        if (cancelled) return;
        try {
          await engine.trigger.prepareSnapshot(
            history.files[snapshot.hash],
            snapshot.hash,
            offset + 1,
          );
        } catch (error) {
          if (!cancelled)
            useHistory
              .getState()
              .markSnapshotFailed(snapshot.hash, `${snapshot.fileName}: ${String(error)}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    engine,
    active,
    selected?.hash,
    dates,
    index,
    history.files,
    history.switching,
    history.playing,
    history.playbackSpeed,
    history.failedSnapshots,
  ]);
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
                disabled={history.switching || previousIndex < 0}
                onClick={() => {
                  history.setPlaying(false);
                  choose(previousIndex);
                }}
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </GameButton>
              <GameButton
                variant="icon"
                aria-label={history.playing ? "Pause saved timeline" : "Play saved timeline"}
                disabled={!history.playing && (history.switching || nextIndex < 0)}
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
                disabled={history.switching || nextIndex < 0}
                onClick={() => {
                  history.setPlaying(false);
                  choose(nextIndex);
                }}
              >
                <ChevronRightIcon className="h-4 w-4" />
              </GameButton>
            </div>
            <div
              className="flex items-center gap-0.5 border-l border-game-line-strong pl-2"
              role="group"
              aria-label="Saved timeline playback speed"
            >
              <GameButton
                variant="icon"
                aria-label="Slower timeline playback"
                title="Slower playback"
                disabled={speedIndex <= 0}
                onClick={() =>
                  history.setPlaybackSpeed(PLAYBACK_SPEEDS[Math.max(0, speedIndex - 1)])
                }
              >
                <ChevronDoubleLeftIcon className="h-4 w-4" />
              </GameButton>
              <span
                className="min-w-10 text-center font-game-num text-[11px] text-game-accent-100"
                aria-live="polite"
                aria-atomic="true"
                title="Playback speed · 1× waits 1.2 seconds between saved dates"
              >
                {history.playbackSpeed}×
              </span>
              <GameButton
                variant="icon"
                aria-label="Faster timeline playback"
                title="Faster playback"
                disabled={speedIndex >= PLAYBACK_SPEEDS.length - 1}
                onClick={() =>
                  history.setPlaybackSpeed(
                    PLAYBACK_SPEEDS[Math.min(PLAYBACK_SPEEDS.length - 1, speedIndex + 1)],
                  )
                }
              >
                <ChevronDoubleRightIcon className="h-4 w-4" />
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
        {Object.keys(history.failedSnapshots).length > 0 ? (
          <span
            role="status"
            className="max-w-48 truncate text-[10px] text-game-ink-300"
            title={Object.values(history.failedSnapshots).join("\n")}
          >
            {Object.keys(history.failedSnapshots).length} unavailable · skipped
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
