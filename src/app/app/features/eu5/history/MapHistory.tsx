import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useState } from "react";
import { useCampaign } from "@/features/campaign/CampaignProvider";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import { addDays, addMonths, addYears, daysBetween } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import type { TimelineController } from "@/features/timeline/controller";
import type { GradientConfig } from "@/wasm/wasm_eu5";
import {
  useEu5Context,
  useEu5Engine,
  useEu5MapMode,
  useEu5PlaythroughId,
  useEu5SaveDate,
} from "../store";
import { CampaignAnalysis } from "./CampaignAnalysis";
import { campaignAnalysis } from "./analysisClient";
import type { Eu5SnapshotDescriptor as MapFrame } from "./analysisTypes";
import { MapHistoryContext } from "./context";
import {
  mapFrameDate,
  mapTimelineBounds,
  nearestMapFrame,
  publishedMapFrames,
} from "./mapPlayback";
import {
  bindPreviewNavigation,
  cancelPreview,
  connectFrames,
  loadedSnapshotId,
  openPreview,
  previewSnapshot,
  repaintPreview,
  setPreviewPlayback,
  usePreviewPlayback,
  usePreviewSession,
} from "./previewSession";
import { useHistory } from "./store";
import { useIsCampaignAnalysisEnabled } from "./useIsCampaignAnalysisEnabled";

const EMPTY_FRAMES: MapFrame[] = [];

/** The playhead waits this long before the app opens the save at the playhead. */
const OPEN_DELAY_MS = 250;

function useMapHistoryState() {
  const store = useEu5Context();
  const engine = useEu5Engine();
  const currentMapMode = useEu5MapMode();
  const campaignId = useEu5PlaythroughId();
  const featureEnabled = useIsCampaignAnalysisEnabled();
  const enabled = useHistory(
    (state) =>
      featureEnabled && !!campaignId && state.analysisEnabledCampaigns.includes(campaignId),
  );
  const saveDate = useEu5SaveDate();
  const campaign = useCampaign();
  const progress = useHistory((history) => history.progress);
  const imported = useHistory((history) => history.snapshots);
  const speed = useHistory((history) => history.playbackSpeed);
  const preview = usePreviewSession();
  const [layout, setLayout] = useState<{ engine: typeof engine; key: string } | null>(null);
  const frames = useMemo(
    () =>
      layout?.engine === engine && campaignId
        ? publishedMapFrames(imported, campaignId, layout.key)
        : EMPTY_FRAMES,
    [layout, engine, campaignId, imported],
  );
  // Read again when the sources or the registry change.
  useHistory((history) => history.sources);
  localSaveRegistry.useEntries();
  const loadedId = loadedSnapshotId(store);
  const previewing = preview.kind !== "live" && preview.campaignId === campaignId;
  const selectedId = previewing ? preview.snapshotId : loadedId;
  const index = selectedId
    ? frames.findIndex((frame) => frame.id === selectedId)
    : frames.findIndex((frame) => daysBetween(mapFrameDate(frame), saveDate) === 0);
  const selectedFrame = frames[index];
  const readyIds = useMemo(() => new Set(frames.map((frame) => frame.id)), [frames]);
  const [scrubbing, setScrubbing] = useState(false);
  // Playback belongs to the map mode it started in.
  const playingMode = usePreviewPlayback((playback) => playback.mode);
  const playing = frames.length > 0 && playingMode === currentMapMode;
  const setPlaying = (next: boolean) => setPreviewPlayback(next ? currentMapMode : null);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    bindPreviewNavigation(campaign);
  }, [campaign]);

  useEffect(() => (enabled ? connectFrames(engine) : undefined), [engine, enabled]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || campaignId === null) return;
    void engine.trigger.getMapLayoutKey().then(
      (key) => {
        if (!cancelled) {
          setLayout({ engine, key });
          setError(null);
        }
      },
      (failure) => {
        if (!cancelled) setError(`Campaign analysis: ${String(failure)}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [engine, campaignId, enabled]);

  // Only the political mode has a history in the loaded save, so it shows that save.
  const followEngine = useEffectEvent(() => {
    // Playback stops when the mode changes, and does not resume on a return.
    if (playingMode !== null && playingMode !== currentMapMode) setPreviewPlayback(null);
    if (currentMapMode === "political") cancelPreview();
    else repaintPreview(engine, currentMapMode);
  });
  useEffect(() => {
    followEngine();
  }, [engine, currentMapMode]);

  const opening = previewing && preview.kind === "opening";

  const move = (next: number) => {
    if (currentMapMode === "political" || !frames.length || !campaignId) return;
    const frame = frames[Math.max(0, Math.min(next, frames.length - 1))];
    engine.trigger.pauseTimeline();
    if (!previewing && frame.id === loadedId) return;
    previewSnapshot(engine, campaignId, frame.id, currentMapMode);
  };
  const advance = useEffectEvent(() => {
    if (index >= frames.length - 1) {
      if (progress === null) setPlaying(false);
    } else move(index + 1);
  });
  useEffect(() => {
    if (!playing || currentMapMode === "political") return;
    const timer = setInterval(advance, 500 / speed);
    return () => clearInterval(timer);
  }, [playing, currentMapMode, speed]);

  const open = useEffectEvent(() => {
    if (campaign) void openPreview(campaign);
  });
  const waiting = previewing && preview.kind === "preview" && !preview.error;
  useEffect(() => {
    if (!waiting || playing || scrubbing) return;
    const timer = setTimeout(open, OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [waiting, playing, scrubbing, selectedId]);

  const retry = () => {
    setError(null);
    if (campaign) void openPreview(campaign);
  };

  const clearCampaign = async () => {
    if (!campaignId || progress !== null) return;
    setPlaying(false);
    cancelPreview();
    try {
      await campaignAnalysis().clearCampaign(campaignId);
      useHistory.setState((history) => {
        const snapshots = history.snapshots.filter((row) => row.campaignId !== campaignId);
        const ids = new Set(snapshots.map((row) => row.id));
        return {
          snapshots,
          sources: Object.fromEntries(
            Object.entries(history.sources).filter(([, source]) => ids.has(source.snapshotId)),
          ),
          issues: [],
          memoryFull: null,
          analysisPausedCampaigns: [...new Set([...history.analysisPausedCampaigns, campaignId])],
        };
      });
    } catch (failure) {
      setError(String(failure));
    }
  };

  const shown = previewing ? preview.shown : null;
  let controller: TimelineController | null = null;
  if (enabled && currentMapMode !== "political" && campaignId) {
    const { start, end } = mapTimelineBounds(
      saveDate,
      frames,
      campaign?.saves.filter((save) => save.membership !== "different").map((save) => save.date) ??
        [],
    );
    const date = selectedFrame ? mapFrameDate(selectedFrame) : saveDate;
    const setDate: TimelineController["setDate"] = (next) => {
      setPlaying(false);
      move(nearestMapFrame(frames, next));
    };
    controller = {
      playbackHint: `${2 * speed} saved dates per second`,
      timeline: {
        available: true,
        start,
        end,
        changeDays: frames.map((frame) => daysBetween(start, mapFrameDate(frame))),
        changeCounts: frames.map(() => 1),
        notes: [],
      },
      date,
      live: daysBetween(date, end) === 0,
      playback: playing ? "playing" : "paused",
      playing,
      locked: frames.length === 0,
      totalDays: daysBetween(start, end),
      dayOffset: daysBetween(start, date),
      mapDayOffset: daysBetween(start, shown?.date ?? saveDate),
      setDate,
      beginScrub: () => setScrubbing(true),
      commitDayOffset: (day) => {
        setDate(addDays(start, day));
        setScrubbing(false);
      },
      setDayOffset: (day) => setDate(addDays(start, day)),
      jumpToStart: () => {
        setPlaying(false);
        move(0);
      },
      jumpToEnd: () => {
        setPlaying(false);
        move(frames.length - 1);
      },
      step: (unit, direction) => {
        setPlaying(false);
        if (unit === "day") move(index + direction);
        else setDate(unit === "month" ? addMonths(date, direction) : addYears(date, direction));
      },
      togglePlayback: () => {
        engine.trigger.pauseTimeline();
        if (!playing) move(index < 0 || index >= frames.length - 1 ? 0 : index);
        setPlaying(!playing);
      },
    };
  }

  // A click on a history chart moves the playhead. The save opens when it stops.
  const showSnapshot =
    controller &&
    ((snapshotId: string) => {
      const next = frames.findIndex((frame) => frame.id === snapshotId);
      if (next < 0) return;
      setPlaying(false);
      move(next);
    });

  // The date and legend follow the frame that the map shows, not the request.
  const previewView: {
    shown: { date: DateComponents; gradient: GradientConfig | null } | null;
  } | null = previewing ? { shown: shown && { date: shown.date, gradient: shown.gradient } } : null;
  return {
    controller,
    enabled,
    campaignId,
    /** The snapshot that the map shows, or null if the analysis does not have it. */
    shownId: previewing ? (shown?.snapshotId ?? null) : (loadedId ?? null),
    showSnapshot,
    progress,
    frames: frames.length,
    readyIds,
    error: (previewing ? preview.error : null) ?? error,
    opening,
    preview: previewView,
    retry,
    clearCampaign,
    playing,
  };
}

export type MapHistoryValue = ReturnType<typeof useMapHistoryState>;

/** Keep history subscriptions and worker connections outside the normal viewer. */
export function MapHistoryProvider({ children }: { children: React.ReactNode }) {
  const value = useMapHistoryState();
  return (
    <MapHistoryContext.Provider value={value}>
      <CampaignAnalysis />
      {children}
    </MapHistoryContext.Provider>
  );
}
