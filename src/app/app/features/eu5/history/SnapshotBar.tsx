import { useEffect, useEffectEvent, useMemo, useLayoutEffect, useRef, useState } from "react";
import { useCampaign } from "@/features/campaign/CampaignProvider";
import type { CampaignSave } from "@/features/campaign/types";
import { canOpen } from "@/features/campaign/campaignSaves";
import { getLocalSave } from "@/features/campaign/localSaves";
import { GameButton } from "@/components/game/Button";
import {
  prepareEu5Session,
  useEu5MapMode,
  useEu5PlaythroughId,
  useSetEu5InsightPanelOpen,
  useSetEu5TimelineBarHeight,
} from "../store";
import { isHistoricalMapMode } from "../ui-engine";
import { useViewportInsets } from "../useViewportInsets";
import { useHistory } from "./store";

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
export function useHasSnapshotTimeline() {
  const campaign = useCampaign();
  const mode = useEu5MapMode();
  const timelineMode = useHistory((state) => state.timelineMode);
  return !!campaign && (timelineMode === "saves" || !isHistoricalMapMode(mode));
}

/** Playback asks the campaign to open saves; it never owns their files or the active date. */
export function SnapshotBar() {
  const campaign = useCampaign();
  const visible = useHasSnapshotTimeline();
  const history = useHistory();
  const mapMode = useEu5MapMode();
  const playthroughId = useEu5PlaythroughId();
  const insets = useViewportInsets();
  const setHeight = useSetEu5TimelineBarHeight();
  const setPanelOpen = useSetEu5InsightPanelOpen();
  const ref = useRef<HTMLDivElement>(null);
  const saves = useMemo(
    () => campaign?.saves.filter((save) => save.membership !== "different" && canOpen(save)) ?? [],
    [campaign?.saves],
  );
  const index = saves.findIndex((save) => save.isOpen);
  const [draftState, setDraftState] = useState({ index, value: index });
  const draft = draftState.index === index ? draftState.value : index;
  if (draftState.index !== index) setDraftState({ index, value: index });
  const previous = saves.findLastIndex((save, i) => i < index && !history.failedSaves[save.key]);
  const next = saves.findIndex((save, i) => i > index && !history.failedSaves[save.key]);
  const choose = useEffectEvent(async (save: CampaignSave | undefined) => {
    if (!save || !campaign || campaign.opening || save.isOpen) return;
    const result = await campaign.open(save);
    if (result.kind === "failed") {
      useHistory
        .getState()
        .markFailed(
          save.key,
          `${save.name}: ${result.failure.kind === "load" ? String(result.failure.error) : "Save unavailable"}`,
        );
    } else if (result.kind === "cancelled") useHistory.getState().setPlaying(false);
  });
  useEffect(() => {
    useHistory.getState().setPlaying(false);
  }, [playthroughId]);
  useEffect(() => {
    if (!visible || !history.playing || campaign?.opening) return;
    if (next < 0) {
      useHistory.getState().setPlaying(false);
      return;
    }
    const timer = setTimeout(() => void choose(saves[next]), 1200 / history.playbackSpeed);
    return () => clearTimeout(timer);
  }, [visible, history.playing, history.playbackSpeed, campaign?.opening, next, saves]);
  const upcoming = saves[next];
  useEffect(() => {
    if (!visible || campaign?.opening || upcoming?.source.kind !== "local") return;
    const entry = getLocalSave(upcoming.source.entryId);
    // Preparation is optional. Opening still reports a failure through campaign navigation.
    if (entry) void prepareEu5Session(entry.ref).catch(() => {});
  }, [visible, campaign?.opening, upcoming]);
  useLayoutEffect(() => {
    if (!visible || !ref.current) return;
    const element = ref.current;
    const report = () => setHeight(element.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => {
      observer.disconnect();
      setHeight(0);
    };
  }, [visible, setHeight]);
  if (!visible || !campaign) return null;
  const open = saves[index];
  const go = (i: number) => {
    history.setPlaying(false);
    void choose(saves[i]);
  };
  return (
    <div
      ref={ref}
      className="pointer-events-auto absolute bottom-4 z-20 rounded-panel border border-game-line-strong bg-game-overlay p-2 font-game-ui shadow-xl backdrop-blur-md"
      style={{ left: insets.left + 16, right: insets.right + 16 }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <GameButton
          aria-label="First saved date"
          disabled={!!campaign.opening || index <= 0}
          onClick={() => go(0)}
        >
          First
        </GameButton>
        <GameButton
          aria-label="Previous saved date"
          disabled={!!campaign.opening || previous < 0}
          onClick={() => go(previous)}
        >
          Previous
        </GameButton>
        <GameButton
          aria-label={history.playing ? "Pause saved-date playback" : "Play saved-date playback"}
          disabled={!history.playing && next < 0}
          onClick={() => history.setPlaying(!history.playing)}
        >
          {history.playing ? "Pause" : "Play"}
        </GameButton>
        <GameButton
          aria-label="Next saved date"
          disabled={!!campaign.opening || next < 0}
          onClick={() => go(next)}
        >
          Next
        </GameButton>
        <GameButton
          aria-label="Last saved date"
          disabled={!!campaign.opening || index === saves.length - 1}
          onClick={() => go(saves.length - 1)}
        >
          Last
        </GameButton>
        <span className="font-game-num text-xs text-game-ink-300">
          {open
            ? `${open.date.year}-${String(open.date.month).padStart(2, "0")}-${String(open.date.day).padStart(2, "0")}`
            : "Saved dates"}
        </span>
        <label className="text-xs text-game-ink-300">
          Speed{" "}
          <select
            aria-label="Saved-date playback speed"
            className="rounded-control border border-game-line bg-game-panel text-game-ink-300"
            value={history.playbackSpeed}
            onChange={(event) => history.setPlaybackSpeed(Number(event.target.value))}
          >
            {SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </label>
        <input
          aria-label="Saved-date timeline"
          type="range"
          min={0}
          max={Math.max(0, saves.length - 1)}
          value={Math.max(0, draft)}
          disabled={!!campaign.opening}
          className="min-w-32 flex-1 accent-game-accent-100"
          onChange={(event) => setDraftState({ index, value: Number(event.target.value) })}
          onPointerUp={() => go(draft)}
          onKeyUp={() => go(draft)}
        />
        <span className="text-xs text-game-ink-500">
          {index + 1}/{saves.length}
        </span>
        {isHistoricalMapMode(mapMode) && (
          <GameButton variant="ghost" onClick={() => history.setTimelineMode("ownership")}>
            Ownership history
          </GameButton>
        )}
        <GameButton
          variant="ghost"
          onClick={() => {
            history.showPanel(true);
            setPanelOpen(true);
          }}
        >
          Over time
        </GameButton>
      </div>
      {Object.keys(history.failedSaves).length > 0 && (
        <p
          role="status"
          className="mt-1 text-xs text-game-ink-500"
          title={Object.values(history.failedSaves).join("\n")}
        >
          {Object.keys(history.failedSaves).length} unavailable saves skipped during playback.
        </p>
      )}
    </div>
  );
}
