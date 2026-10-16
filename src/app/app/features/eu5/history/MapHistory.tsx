import type { MapInteraction } from "./mapInteraction";
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";
import { useIsDeveloper } from "@/features/account";
import { isAbortError } from "@/lib/abortController";
import { useCampaign } from "@/features/campaign/CampaignProvider";
import { ensureObservationLoaded, cancelObservationLoad } from "./observationLoader";
import { holdsRef, localSaveRegistry } from "@/features/campaign/localSaves";
import { sameFileVersion } from "@/features/campaign/types";
import { addDays, addMonths, addYears, daysBetween } from "@/features/timeline/date";
import type { TimelineController } from "@/features/timeline/controller";
import {
  activeEu5Store,
  useEu5AppState,
  useEu5Engine,
  useEu5PlaythroughId,
  useEu5SaveDate,
  useEu5Input,
  useEu5SaveInput,
  useSetEu5InsightPanelOpen,
} from "../store";
import { CampaignAnalysis } from "./CampaignAnalysis";
import { campaignAnalysis, connectAnalysisFrames } from "./analysisClient";
import type { MapObservation as MapFrame } from "./analysisTypes";
import {
  publishedMapFrames,
  mapTimelineBounds,
  mapFrameDate,
  nearestMapFrame,
} from "./mapPlayback";
import { useHistory } from "./store";
import { captureEu5Carry } from "../campaignCarry";

const EMPTY_FRAMES: MapFrame[] = [];

function useMapHistoryState() {
  const engine = useEu5Engine();
  const state = useEu5AppState();
  const campaignId = useEu5PlaythroughId();
  const isDeveloper = useIsDeveloper();
  const enabled = useHistory(
    (state) => isDeveloper && !!campaignId && state.analysisEnabledCampaigns.includes(campaignId),
  );
  const saveDate = useEu5SaveDate();
  const setPanelOpen = useSetEu5InsightPanelOpen();
  const campaign = useCampaign();
  const progress = useHistory((history) => history.progress);
  const imported = useHistory((history) => history.snapshots);
  const speed = useHistory((history) => history.playbackSpeed);
  const [layout, setLayout] = useState<{ engine: typeof engine; key: string } | null>(null);
  const frames = useMemo(
    () =>
      layout?.engine === engine && campaignId
        ? publishedMapFrames(imported, campaignId, layout.key)
        : EMPTY_FRAMES,
    [layout, engine, campaignId, imported],
  );
  const selectedHash =
    useHistory((history) => (campaignId ? history.selectedObservations[campaignId] : undefined)) ??
    state.mapProjection?.hash;
  const input = useEu5Input(),
    parsed = useEu5SaveInput();
  const sources = useHistory((history) => history.sources);
  const entries = localSaveRegistry.useEntries();
  const openEntry =
    input.kind === "server" ? undefined : entries.find((entry) => holdsRef(entry, input));
  const openSource = openEntry && sources[openEntry.id];
  const loadedHash =
    parsed.kind === "file" && openSource && sameFileVersion(parsed.file, openSource.version)
      ? openSource.hash
      : undefined;
  const [scrubbing, setScrubbing] = useState(false);
  const attemptedSettlement = useRef<string | null>(null);
  const settling = useHistory((history) => history.settlingObservation?.campaignId === campaignId);
  const index = selectedHash
    ? frames.findIndex((frame) => frame.hash === selectedHash)
    : frames.findIndex((frame) => daysBetween(mapFrameDate(frame), saveDate) === 0);
  const selectedFrame = frames[index];
  const selectedAvailable = !!selectedFrame;
  const readyHashes = useMemo(
    () =>
      new Set(
        imported
          .filter(
            (snapshot) =>
              layout?.engine === engine &&
              snapshot.campaignId === campaignId &&
              "layoutKey" in snapshot &&
              snapshot.layoutKey === layout.key,
          )
          .map((snapshot) => snapshot.hash),
      ),
    [imported, layout, engine, campaignId],
  );
  const requestedFrame = useRef<{ engine: typeof engine; mode: string; hash: string } | null>(null);
  const previousMode = useRef({ engine, mode: state.currentMapMode });
  const [painted, setPainted] = useState(0);
  const [requestedPlaying, setPlaying] = useState(false);
  const playing = frames.length > 0 && requestedPlaying;
  const [inspecting, setInspecting] = useState(false);
  const inspection = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentEngine = useRef<typeof engine | null>(engine);
  useLayoutEffect(() => {
    currentEngine.current = engine;
    return () => {
      currentEngine.current = null;
    };
  }, [engine]);
  const connection = useRef<Promise<() => void> | null>(null);
  const paint = useCallback(
    async (frame: MapFrame) => {
      if (
        frame.campaignId !== campaignId ||
        currentEngine.current !== engine ||
        engine.getState().currentMapMode === "political"
      )
        return;
      const active = activeEu5Store();
      if (
        active &&
        !engine.getState().mapProjection &&
        !useHistory.getState().previewCarries[frame.campaignId]
      ) {
        const carry = await captureEu5Carry(active);
        useHistory.setState((history) => ({
          previewCarries: {
            ...history.previewCarries,
            [frame.campaignId]: history.previewCarries[frame.campaignId] ?? carry,
          },
        }));
      }
      await connection.current;
      if (currentEngine.current !== engine || engine.getState().currentMapMode === "political")
        return;
      await engine.trigger.showMapProjection(frame);
      if (currentEngine.current === engine && engine.getState().currentMapMode !== "political")
        setPainted(frame.dateSort);
    },
    [engine, campaignId],
  );
  const failed = useCallback((failure: unknown) => {
    setError(String(failure));
    setPlaying(false);
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!enabled) return;
    const pending = connectAnalysisFrames(engine.trigger.connectMapFrames);
    connection.current = pending;
    void pending.then((disconnect) => {
      if (cancelled) disconnect();
    }, failed);
    return () => {
      cancelled = true;
      void engine.trigger.stopMapProjection().catch(() => {});
      void pending.then(
        (disconnect) => disconnect(),
        () => {},
      );
    };
  }, [engine, failed, enabled]);

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

  const requestFrame = (frame: MapFrame) => {
    requestedFrame.current = { engine, mode: state.currentMapMode, hash: frame.hash };
    void paint(frame).catch((failure) => {
      if (!isAbortError(failure)) failed(failure);
    });
  };
  const changeMode = useEffectEvent(() => {
    if (
      previousMode.current.engine !== engine ||
      previousMode.current.mode !== state.currentMapMode
    ) {
      previousMode.current = { engine, mode: state.currentMapMode };
      setPlaying(false);
    }
    if (inspection.current) return;
    // A freshly opened entity owns the rich save view. Background timeline
    // discovery must not replace it with an overview projection.
    if (!state.mapProjection && state.selectionState?.isEmpty === false) return;
    if (state.currentMapMode === "political") {
      requestedFrame.current = null;
      void engine.trigger.stopMapProjection();
    } else {
      const previous = requestedFrame.current;
      if (
        selectedFrame &&
        (playing || scrubbing || !!state.mapProjection || selectedFrame.hash !== loadedHash) &&
        !settling &&
        !(
          previous?.engine === engine &&
          previous.mode === state.currentMapMode &&
          previous.hash === selectedFrame.hash
        )
      )
        requestFrame(selectedFrame);
    }
  });
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) changeMode();
    });
    return () => {
      cancelled = true;
    };
  }, [engine, state.currentMapMode, selectedFrame?.hash, loadedHash, settling]);

  const move = (next: number) => {
    if (inspection.current || state.currentMapMode === "political" || !frames.length) return;
    const clamped = Math.max(0, Math.min(next, frames.length - 1));
    if (!campaignId) return;
    useHistory.setState((history) => ({
      selectedObservations: { ...history.selectedObservations, [campaignId]: frames[clamped].hash },
    }));
    cancelObservationLoad(campaignId);
    attemptedSettlement.current = null;
    setError(null);
    engine.trigger.pauseTimeline();
    requestFrame(frames[clamped]);
  };
  const advance = useEffectEvent(() => {
    if (index >= frames.length - 1) {
      if (progress === null) setPlaying(false);
    } else move(index + 1);
  });
  useEffect(() => {
    if (!playing || state.currentMapMode === "political") return;
    const timer = setInterval(advance, 500 / speed);
    return () => clearInterval(timer);
  }, [playing, state.currentMapMode, speed]);

  const inspect = async (interaction?: MapInteraction) => {
    if (!campaignId || !campaign || inspection.current) return;
    const hash = selectedFrame?.hash ?? state.mapProjection?.hash;
    if (!hash) {
      if (interaction) setPanelOpen(true);
      return;
    }
    inspection.current = !!interaction;
    if (interaction) {
      setPlaying(false);
      setInspecting(true);
    }
    setError(null);
    try {
      await ensureObservationLoaded(campaignId, hash, campaign, interaction);
    } catch (failure) {
      if (!isAbortError(failure) && mounted.current) {
        setError(String(failure));
        const active = activeEu5Store()?.getState().engine;
        if (active && selectedFrame && activeEu5Store()?.getState().playthroughId === campaignId) {
          try {
            const disconnect = await connectAnalysisFrames(active.trigger.connectMapFrames);
            await active.trigger.showMapProjection(selectedFrame);
            disconnect();
          } catch {
            /* Keep the original loading failure. */
          }
        }
      }
    } finally {
      inspection.current = false;
      if (mounted.current) setInspecting(false);
    }
  };
  const settle = useEffectEvent(() => {
    attemptedSettlement.current = selectedHash ?? null;
    void inspect();
  });
  useEffect(() => {
    if (
      !enabled ||
      playing ||
      scrubbing ||
      !selectedHash ||
      !selectedAvailable ||
      settling ||
      attemptedSettlement.current === selectedHash ||
      (selectedHash === loadedHash && !state.mapProjection) ||
      state.currentMapMode === "political"
    )
      return;
    const timer = setTimeout(settle, 250);
    return () => clearTimeout(timer);
  }, [
    enabled,
    playing,
    scrubbing,
    selectedHash,
    selectedAvailable,
    loadedHash,
    settling,
    state.mapProjection,
    state.currentMapMode,
  ]);
  const clearCampaign = async () => {
    if (!campaignId || inspection.current || progress !== null) return;
    inspection.current = true;
    setInspecting(true);
    setPlaying(false);
    try {
      await engine.trigger.stopMapProjection();
      if (!mounted.current || currentEngine.current !== engine) return;
      await engine.trigger.clearMapProjection();
      await campaignAnalysis().clearCampaign(campaignId);
      useHistory.setState((history) => {
        const snapshots = history.snapshots.filter((row) => row.campaignId !== campaignId);
        const hashes = new Set(snapshots.map((row) => row.hash));
        return {
          snapshots,
          sources: Object.fromEntries(
            Object.entries(history.sources).filter(([, source]) => hashes.has(source.hash)),
          ),
          issues: [],
          analysisPausedCampaigns: [...new Set([...history.analysisPausedCampaigns, campaignId])],
        };
      });
      useHistory.setState((history) => ({
        selectedObservations: Object.fromEntries(
          Object.entries(history.selectedObservations).filter(([id]) => id !== campaignId),
        ),
      }));
      requestedFrame.current = null;
    } catch (failure) {
      if (mounted.current) setError(String(failure));
    } finally {
      inspection.current = false;
      if (mounted.current) setInspecting(false);
    }
  };
  const requestInspection = useEffectEvent((interaction: MapInteraction) => {
    void inspect(interaction);
  });
  useEffect(() => {
    void engine.trigger.onMapInspect((interaction) => {
      requestInspection(interaction);
    });
    return () => {
      void engine.trigger.onMapInspect(null).catch(() => {});
    };
  }, [engine]);

  let controller: TimelineController | null = null;
  if (enabled && state.currentMapMode !== "political" && campaignId) {
    const { start, end } = mapTimelineBounds(
      saveDate,
      frames,
      campaign?.saves.filter((save) => save.membership !== "different").map((save) => save.date) ??
        [],
    );
    const date = selectedFrame ? mapFrameDate(selectedFrame) : saveDate;
    const paintedFrame = frames.find((frame) => frame.dateSort === painted);
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
      locked: inspecting || frames.length === 0,
      totalDays: daysBetween(start, end),
      dayOffset: daysBetween(start, date),
      mapDayOffset: daysBetween(
        start,
        paintedFrame ? mapFrameDate(paintedFrame) : (state.mapProjection?.date ?? saveDate),
      ),
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
  return {
    controller,
    enabled,
    progress,
    frames: frames.length,
    readyHashes,
    error,
    inspecting,
    settling,
    preview: state.mapProjection,
    inspect,
    clearCampaign,
    playing,
  };
}

const MapHistoryContext = createContext<ReturnType<typeof useMapHistoryState> | null>(null);
export function MapHistoryProvider({ children }: { children: React.ReactNode }) {
  const value = useMapHistoryState();
  return (
    <MapHistoryContext.Provider value={value}>
      <CampaignAnalysis />
      {children}
    </MapHistoryContext.Provider>
  );
}
export function useMapHistory() {
  const value = useContext(MapHistoryContext);
  return value;
}
