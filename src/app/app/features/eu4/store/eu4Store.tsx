import { compatibilityReport } from "@/lib/compatibility";
import { check } from "@/lib/isPresent";
import type { MapController } from "@pdx.tools/map";
import { pdxApi } from "@/services/appApi";
import { createContext, useContext, useMemo } from "react";
import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import { mapModes } from "../types/map";
import type { MapPayload } from "../types/map";
import type {
  CountryMatcher,
  AchievementsScore,
  EnhancedCountryInfo,
  CountryTag,
} from "../types/models";
import { getEu4Worker } from "../worker/getEu4Worker";
import type { EnhancedMeta, FileObservationFrequency, MapTimelapseItem } from "../worker/module";
import type { TimelineData, TimelineKind } from "@/wasm/wasm_eu4";
import { proxy } from "comlink";
import { emitEvent } from "@/lib/events";
import {
  addDays,
  addMonths,
  addYears,
  daysBetween,
  formatIsoDate,
  parseDate,
} from "@/features/timeline/date";
import { TIMELAPSE_FPS, timelapsePlan } from "@pdx.tools/timelapse";
import type { TimelapseFile, TimelapseOptions } from "@pdx.tools/timelapse";
import { readDatePlateColors, readDatePlateFonts } from "@/features/timeline/datePlate";
import type {
  TimelapseProgress,
  TimelinePlayback,
  TimelineStepUnit,
} from "@/features/timeline/controller";
import { log } from "@/lib/log";

export const emptyEu4CountryFilter: CountryMatcher = {
  players: "none",
  ai: "none",
  subcontinents: [],
  include: [],
  exclude: [],
  includeSubjects: false,
};

export const initialEu4CountryFilter: CountryMatcher = {
  ...emptyEu4CountryFilter,
  players: "all",
  ai: "alive",
};

type Eu4StateProps = {
  save: {
    meta: EnhancedMeta;
    achievements: AchievementsScore;
    countries: EnhancedCountryInfo[];
    defaultSelectedCountry: string;
    saveInfo: { kind: "sync"; data: string } | { kind: "async"; saveId: string };
    initialPoliticalMapColors: Uint8Array;
  };
  map: MapController;
};

type Eu4State = Eu4StateProps & {
  mapMode: MapPayload["kind"];
  showSecondaryColor: boolean;
  paintSubjectInOverlordHue: boolean;
  countryFilter: CountryMatcher;
  renderTerrain: boolean;
  showProvinceBorders: boolean;
  showCountryBorders: boolean;
  showMapModeBorders: boolean;
  selectedTag: string;
  countryDrawerVisible: boolean;
  /**
   * The political timeline is read with the save; the others are read on
   * the first switch to their map mode. All three span the same dates.
   */
  timelines: { political: TimelineData } & Partial<Record<TimelineKind, TimelineData>>;
  /** Days after the timeline start the user asked for. */
  requestedDay: number;
  /** Days after the timeline start the map shows; trails `requestedDay`. */
  mapDayOffset: number;
  playback: TimelinePlayback;
  locked: boolean;
  timelapse: TimelapseProgress;
  showOneTimeLineItems: boolean;
  prefereredValueFormat: "absolute" | "percent";
  watcher: {
    status: "idle" | "running" | "working";
  };
  actions: {
    setCountryDrawer: (open: boolean) => void;
    panToTag: (tag: string, offset?: number) => Promise<void>;
    nextMapMode: () => void;
    setMapMode: (mode: Eu4State["mapMode"]) => Promise<void>;
    setMapShowStripes: (enabled: boolean) => Promise<void>;
    setPaintSubjectInOverlordHue: (enabled: boolean) => Promise<void>;
    setShowProvinceBorders: (enabled: boolean) => void;
    setShowCountryBorders: (enabled: boolean) => void;
    setShowMapModeBorders: (enabled: boolean) => void;
    setTerrainOverlay: (enabled: boolean) => Promise<void> | undefined;
    setPrefersPercents: (enabled: boolean) => void;
    setShowOneTimeLineItems: (enabled: boolean) => void;
    setSelectedTag: (tag: string) => void;
    setSelectedDateDay: (days: number) => Promise<void>;
    setSelectedDateText: (text: string) => Promise<void>;
    pauseTimeline: () => void;
    stepTimeline: (unit: TimelineStepUnit, direction: 1 | -1) => void;
    toggleTimelinePlayback: () => void;
    recordTimelapse: (options: TimelapseOptions) => Promise<TimelapseFile | null>;
    stopTimelapse: () => void;
    startWatcher: (frequency: FileObservationFrequency) => void;
    stopWatcher: () => void;
    updateProvinceColors: (options?: { countryColors?: Uint8Array }) => Promise<void>;
    updateMap: (frame: MapTimelapseItem) => void;
    updateTagFilter: (matcher: Partial<CountryMatcher>) => Promise<void>;
    updateSave: (save: {
      meta: EnhancedMeta;
      achievements: AchievementsScore;
      countries: EnhancedCountryInfo[];
    }) => Promise<void>;
    zoomIn: () => void;
    zoomOut: () => void;
  };
};

export type Eu4Store = StoreApi<Eu4State>;
type Eu4StoreInit = Eu4StateProps & {
  store: Eu4Store | null;
  settings: PersistedMapSettings;
};
export const Eu4SaveContext = createContext<Eu4Store | null>(null);

export const createEu4Store = async ({ store: prevStore, save, map, settings }: Eu4StoreInit) => {
  const worker = getEu4Worker();
  const politicalTimeline = await worker.eu4GetTimeline("political");
  let playbackFrame: number | null = null;
  let rewindTimer: ReturnType<typeof setTimeout> | null = null;
  let timelapseStopped = false;
  const defaults = {
    mapMode: "political",
    paintSubjectInOverlordHue: false,
    showSecondaryColor: true,
    showOneTimeLineItems: true,
    prefereredValueFormat: "absolute",
    countryFilter: initialEu4CountryFilter,
    showProvinceBorders: true,
    showCountryBorders: true,
    showMapModeBorders: false,
    countryDrawerVisible: false,
  } as const;

  const syncMapSettings = (state: Eu4State, options?: { draw?: boolean }) => {
    const report = compatibilityReport().webgl2;
    state.map.update(
      {
        renderTerrain: state.renderTerrain && report.enabled && !report.performanceCaveat,
        showProvinceBorders: state.showProvinceBorders,
        showCountryBorders: selectShowCountryBorders(state),
        showMapModeBorders: state.showMapModeBorders,
      },
      options,
    );

    persistMapSettings({
      renderTerrain: state.renderTerrain,
      showProvinceBorders: state.showProvinceBorders,
      showCountryBorders: state.showCountryBorders,
      showMapModeBorders: state.showMapModeBorders,
    });
  };

  /**
   * One worker round trip at a time. A drag fires a request per pointer
   * event; while one is out, only the newest waits, and the rest are
   * dropped, so the map lands on the pointer instead of chasing it.
   */
  let advancing: Promise<void> | null = null;
  let pendingDay: number | null = null;
  const advanceMap = (day: number): Promise<void> => {
    // A recording steps the same cursor; a nudge now would land in the film.
    if (store.getState().locked) return Promise.resolve();
    pendingDay = day;
    if (advancing !== null) return advancing;
    advancing = (async () => {
      try {
        while (pendingDay !== null) {
          const next = pendingDay;
          pendingDay = null;
          const kind = timelineKindForMode(store.getState().mapMode);
          const item = await worker.eu4TimelineAdvance(kind, next);
          store.getState().actions.updateMap(item);
          store.getState().map.redrawMap();
        }
      } finally {
        advancing = null;
      }
    })();
    return advancing;
  };

  const ensureTimeline = async (kind: TimelineKind) => {
    if (store.getState().timelines[kind] !== undefined) return;
    const timeline = await worker.eu4GetTimeline(kind);
    store.setState({ timelines: { ...store.getState().timelines, [kind]: timeline } });
  };

  const store = createStore<Eu4State>()((set, get) => ({
    ...defaults,
    ...prevStore?.getState(),
    save,
    map,
    ...settings,
    selectedTag: save.defaultSelectedCountry,
    timelines: { political: politicalTimeline },
    requestedDay: save.meta.total_days,
    mapDayOffset: save.meta.total_days,
    playback: "paused",
    locked: false,
    timelapse: { status: "idle", frame: 0, frames: 0 },
    watcher: {
      status: "idle",
    },
    actions: {
      setCountryDrawer: (open: boolean) => set({ countryDrawerVisible: open }),
      panToTag: async (tag, offset?: number) => {
        const pos = await getEu4Worker().eu4MapPositionOf(tag);
        map.setScaleOfMax(0.5);
        map.moveCameraTo({ x: pos[0], y: pos[1], offsetX: offset });
        map.redrawViewport();
      },
      nextMapMode: () => {
        const index = mapModes.indexOf(get().mapMode);
        get().actions.setMapMode(mapModes[index + 1] ?? mapModes[0]);
      },
      setMapMode: async (mode: Eu4State["mapMode"]) => {
        if (get().locked) return;
        if (dateEnabledMapMode(mode)) await ensureTimeline(timelineKindForMode(mode));
        const countryColors =
          !dateEnabledMapMode(mode) && dateEnabledMapMode(get().mapMode)
            ? new Uint8Array(get().save.initialPoliticalMapColors)
            : undefined;
        set({ mapMode: mode });
        emitEvent({ kind: "Map mode switch", mode });
        syncMapSettings(get());
        await get().actions.updateProvinceColors({ countryColors });
        get().map.redrawMap();
      },
      setMapShowStripes: async (show: boolean) => {
        set({ showSecondaryColor: show });
        await get().actions.updateProvinceColors();
        get().map.redrawMap();
      },
      setPaintSubjectInOverlordHue: async (enabled: boolean) => {
        set({ paintSubjectInOverlordHue: enabled });
        await get().actions.updateProvinceColors();
        get().map.redrawMap();
      },
      setShowProvinceBorders: (enabled: boolean) => {
        set({ showProvinceBorders: enabled });
        syncMapSettings(get(), { draw: true });
      },
      setShowCountryBorders: (enabled: boolean) => {
        if (get().mapMode == "political") {
          set({ showMapModeBorders: enabled });
        }

        set({ showCountryBorders: enabled });
        syncMapSettings(get(), { draw: true });
      },
      setShowMapModeBorders: (enabled: boolean) => {
        set({ showMapModeBorders: enabled });
        syncMapSettings(get(), { draw: true });
      },

      setTerrainOverlay: async (enabled: boolean) => {
        set({ renderTerrain: enabled });
        syncMapSettings(get(), { draw: true });
      },
      setSelectedDateDay: async (days: number) => {
        if (get().locked) return;
        const clamped = Math.max(0, Math.min(days, selectTotalDays(get())));
        set({
          requestedDay: clamped,
          playback: get().playback === "ended" ? "paused" : get().playback,
        });
        await advanceMap(clamped);
      },
      setSelectedDateText: async (text: string) => {
        const date = parseDate(text);
        if (date === null) return;
        await get().actions.setSelectedDateDay(daysBetween(selectTimeline(get()).start, date));
      },
      pauseTimeline: () => {
        if (playbackFrame !== null) cancelAnimationFrame(playbackFrame);
        if (rewindTimer !== null) clearTimeout(rewindTimer);
        playbackFrame = null;
        rewindTimer = null;
        if (get().playback === "playing" || get().playback === "rewinding") {
          set({ playback: "paused" });
        }
      },
      stepTimeline: (unit, direction) => {
        if (get().locked) return;
        get().actions.pauseTimeline();
        const start = selectTimeline(get()).start;
        const from = addDays(start, get().requestedDay);
        const date =
          unit === "day"
            ? addDays(from, direction)
            : unit === "month"
              ? addMonths(from, direction)
              : addYears(from, direction);
        void get().actions.setSelectedDateDay(daysBetween(start, date));
      },
      toggleTimelinePlayback: () => {
        if (get().locked) return;
        if (get().playback === "playing" || get().playback === "rewinding") {
          get().actions.pauseTimeline();
          return;
        }
        const startLoop = () => {
          set({ playback: "playing" });
          let last = performance.now();
          let carry = 0;
          const tick = (now: number) => {
            carry += ((now - last) / 1000) * 365;
            last = now;
            const days = Math.floor(carry);
            if (days > 0) {
              carry -= days;
              const totalDays = selectTotalDays(get());
              const next = Math.min(get().requestedDay + days, totalDays);
              void get().actions.setSelectedDateDay(next);
              if (next >= totalDays) {
                playbackFrame = null;
                set({ playback: "ended" });
                return;
              }
            }
            playbackFrame = requestAnimationFrame(tick);
          };
          playbackFrame = requestAnimationFrame(tick);
        };
        if (get().requestedDay >= selectTotalDays(get())) {
          set({ playback: "rewinding" });
          void get().actions.setSelectedDateDay(0);
          rewindTimer = setTimeout(startLoop, 450);
        } else {
          startLoop();
        }
      },
      stopTimelapse: () => {
        timelapseStopped = true;
      },
      recordTimelapse: async (options) => {
        if (get().timelapse.status !== "idle")
          throw new Error("A timelapse recording is already running");
        get().actions.pauseTimeline();
        timelapseStopped = false;
        const resumeDay = get().requestedDay;
        const timeline = selectTimeline(get());
        const kind = timelineKindForMode(get().mapMode);
        const totalDays = daysBetween(timeline.start, timeline.end);
        const plan = timelapsePlan({ totalDays, options });
        set({ locked: true, timelapse: { status: "recording", frame: 0, frames: plan.frames } });
        // A scrub still in flight would step the cursor under the recording.
        await advancing;
        const frameMs = 1000 / TIMELAPSE_FPS;
        const timing = { date: 0, render: 0, encode: 0, hop: 0, pace: 0, finish: 0 };
        try {
          // Framing is read by the worker before the first date is set, so
          // the current view is the one the player pressed record on. The
          // plate's colors and fonts are read here, where the document is.
          await map.beginRecording({
            framing: options.framing,
            output: { width: plan.quality.width, height: plan.quality.height },
            colors: readDatePlateColors(),
            fonts: readDatePlateFonts(),
          });
          let due = performance.now();
          for (let frame = 0; frame < plan.frames; frame += 1) {
            if (timelapseStopped) return null;
            due += frameMs;
            const day =
              frame === plan.frames - 1 ? totalDays : Math.round(frame * plan.daysPerFrame);
            let lap = performance.now();
            const item = await worker.eu4TimelineAdvance(kind, day);
            timing.date += performance.now() - lap;
            get().actions.updateMap(item);
            // The export plays the film once on screen while it writes it.
            get().map.redrawMap();
            const date = addDays(timeline.start, day);
            lap = performance.now();
            const frameTiming = await map.recordFrame(date);
            timing.render += frameTiming.renderMs;
            timing.encode += frameTiming.encodeMs;
            timing.hop += performance.now() - lap - frameTiming.renderMs - frameTiming.encodeMs;
            set({
              requestedDay: day,
              timelapse: { status: "recording", frame: frame + 1, frames: plan.frames },
            });
            const now = performance.now();
            if (document.visibilityState !== "visible" || now >= due) due = now;
            else {
              const paceStart = performance.now();
              await new Promise((resolve) => setTimeout(resolve, due - now));
              timing.pace += performance.now() - paceStart;
            }
          }
          set({ timelapse: { status: "encoding", frame: plan.frames, frames: plan.frames } });
          const finishStart = performance.now();
          const file = await map.finishRecording();
          timing.finish = performance.now() - finishStart;
          log(`timelapse file: ${file.blob.size} bytes, planned ${plan.bytes}`);
          return file;
        } finally {
          const frames = Math.max(get().timelapse.frame, 1);
          log(
            `timelapse timing: date ${(timing.date / frames).toFixed(1)} ms · render ${(timing.render / frames).toFixed(1)} · encode ${(timing.encode / frames).toFixed(1)} · hop ${(timing.hop / frames).toFixed(1)} · pace ${timing.pace.toFixed(0)} · finish ${timing.finish.toFixed(0)}`,
          );
          await map.endRecording();
          set({ locked: false, timelapse: { status: "idle", frame: 0, frames: 0 } });
          await get().actions.setSelectedDateDay(resumeDay);
        }
      },

      setSelectedTag: (tag: string) => set({ selectedTag: tag, countryDrawerVisible: true }),
      setPrefersPercents: (checked: boolean) =>
        set({ prefereredValueFormat: checked ? "percent" : "absolute" }),
      setShowOneTimeLineItems: (checked: boolean) => set({ showOneTimeLineItems: checked }),
      startWatcher: (frequency: FileObservationFrequency) => {
        emitEvent({ kind: "Save watching", frequency });
        getEu4Worker().startFileObserver(
          frequency,
          proxy(async ({ meta, achievements }) => {
            emitEvent({ kind: "Save parsed", game: "eu4", source: "watched" });
            get().actions.updateSave({
              meta,
              achievements,
              countries: await getEu4Worker().eu4GetCountries(),
            });
          }),
        );

        set({ watcher: { ...get().watcher, status: "running" } });
      },

      stopWatcher: async () => {
        await getEu4Worker().stopFileObserver();
        set({ watcher: { ...get().watcher, status: "idle" } });
      },

      updateTagFilter: async (matcher: Partial<CountryMatcher>) => {
        const newFilter = { ...get().countryFilter, ...matcher };
        set({ countryFilter: newFilter });
        await get().actions.updateProvinceColors();
        get().map.redrawMap();
      },
      updateProvinceColors: async (options?: { countryColors?: Uint8Array }) => {
        if (dateEnabledMapMode(get().mapMode) && get().mapDayOffset !== selectTotalDays(get())) {
          await advanceMap(get().mapDayOffset);
          return;
        }
        const payload = selectMapPayload(get());
        const colors = await getEu4Worker().eu4MapColors(payload);
        const secondary = get().showSecondaryColor ? colors.secondary : colors.primary;
        get().map.updateProvinceColors(colors.primary, secondary, {
          country: options?.countryColors ?? colors.country,
        });
      },
      updateMap: (frame: MapTimelapseItem) => {
        set({ mapDayOffset: frame.days });
        const stripes = get().showSecondaryColor ? frame.secondary : frame.primary;
        get().map.updateProvinceColors(frame.primary, stripes, {
          country: frame.country,
        });
      },
      async updateSave({ meta, achievements, countries }) {
        // The worker dropped its cursor with the reparse. Re-read only the
        // timelines that have been read before; the rest load on demand.
        const kinds = Object.keys(get().timelines) as TimelineKind[];
        const loaded = await Promise.all(
          kinds.map(async (kind) => [kind, await worker.eu4GetTimeline(kind)] as const),
        );
        const political = loaded.find(([kind]) => kind === "political")?.[1] ?? politicalTimeline;
        set({
          save: {
            ...get().save,
            meta,
            achievements,
            countries,
          },
          timelines: { ...Object.fromEntries(loaded), political },
          requestedDay: meta.total_days,
          mapDayOffset: meta.total_days,
        });

        await get().actions.updateProvinceColors();
        get().map.redrawMap();
      },
      zoomIn: () => {
        get().map.zoomIn();
        get().map.redrawViewport();
      },
      zoomOut: () => {
        get().map.zoomOut();
        get().map.redrawViewport();
      },
    },
  }));

  const state = store.getState();
  syncMapSettings(state);
  await state.actions.updateProvinceColors();
  return store;
};

export const selectMapPayload = (state: Eu4State): MapPayload => ({
  kind: state.mapMode,
  tagFilter: state.countryFilter,
  date: selectDate(state).enabledDays,
  paintSubjectInOverlordHue: state.paintSubjectInOverlordHue,
});

export function useEu4Context() {
  return check(useContext(Eu4SaveContext), "Missing Eu4 Save Context");
}

export function useInEu4Analysis() {
  return useContext(Eu4SaveContext) != undefined;
}

const useEu4Store = <T,>(selector: (state: Eu4State) => T): T =>
  useStore(useEu4Context(), selector);
export const useEu4Map = () => useEu4Store((x) => x.map);
export const useEu4Actions = () => useEu4Store((x) => x.actions);
export const useEu4MapMode = () => useEu4Store((x) => x.mapMode);
export const useTerrainOverlay = () => useEu4Store((x) => x.renderTerrain);
export const useMapShowStripes = () => useEu4Store((x) => x.showSecondaryColor);
export const useShowProvinceBorders = () => useEu4Store((x) => x.showProvinceBorders);
export const useShowCountryBorders = () => useEu4Store(selectShowCountryBorders);
export const selectShowCountryBorders = (x: Eu4State) =>
  x.mapMode == "political" ? x.showMapModeBorders : x.showCountryBorders;
export const useShowMapModeBorders = () => useEu4Store((x) => x.showMapModeBorders);
export const usePaintSubjectInOverlordHue = () => useEu4Store((x) => x.paintSubjectInOverlordHue);
export const useEu4Meta = () => useEu4Store((x) => x.save.meta);
export const useAchievements = () => useEu4Store((x) => x.save.achievements);
export const useSelectedTag = () => useEu4Store((x) => x.selectedTag);
export const useTagFilter = () => useEu4Store((x) => x.countryFilter);
export const useValueFormatPreference = () => useEu4Store((x) => x.prefereredValueFormat);
export const useShowOnetimeLineItems = () => useEu4Store((x) => x.showOneTimeLineItems);
export const useCountryDrawerVisible = () => useEu4Store((x) => x.countryDrawerVisible);
export const useWatcher = () => useEu4Store((x) => x.watcher);
export const useEu4Timeline = () => useEu4Store(selectTimeline);
export const useEu4TimelineRequestedDay = () => useEu4Store((x) => x.requestedDay);
export const useEu4TimelineMapDay = () => useEu4Store((x) => x.mapDayOffset);
export const useEu4TimelinePlayback = () => useEu4Store((x) => x.playback);
export const useEu4TimelineLocked = () => useEu4Store((x) => x.locked);
export const useEu4Timelapse = () => useEu4Store((x) => x.timelapse);
export const useColonialOverlord = (tag: CountryTag) =>
  useEu4Store((x) => x.save.meta.colonialSubjects).get(tag);

export function useEu4ModList() {
  const meta = useEu4Meta();

  return meta.mod_enabled.length > 0
    ? meta.mod_enabled
    : meta.mods_enabled_names.map((x) => x.name);
}

export const useIsServerSaveFile = () => {
  const info = useEu4Store((x) => x.save.saveInfo);
  return info.kind === "async";
};

export const useServerSaveFile = () => {
  const info = useEu4Store((x) => x.save.saveInfo);
  const id = info.kind === "async" ? info.saveId : "";
  const saveQuery = pdxApi.save.useGet(id, { enabled: !!id });
  return saveQuery.data;
};

export const useSaveFilename = () => {
  const info = useEu4Store((x) => x.save.saveInfo);
  const serverFile = useServerSaveFile();
  if (info.kind === "sync") {
    return info.data;
  } else {
    return serverFile?.filename ?? "savegame.eu4";
  }
};

export const useSaveFilenameWith = (suffix: string) => {
  const filename = useSaveFilename();
  const nameInd = filename.lastIndexOf(".");
  const outputName = nameInd == -1 ? `${filename}` : `${filename.substring(0, nameInd)}`;

  return `${outputName}${suffix}`;
};

export const useCountryNameLookup = () => {
  const countries = useEu4Countries();
  return useMemo(() => new Map(countries.map((x) => [x.normalizedName, x])), [countries]);
};

export const useEu4Countries = () => useEu4Store((x) => x.save.countries);
const useCountryFiltering = (cb: (arg: EnhancedCountryInfo) => boolean) => {
  const countries = useEu4Countries();
  return useMemo(() => countries.filter(cb), [countries, cb]);
};

const isHumanFilter = (x: EnhancedCountryInfo) => x.is_human;
export const useHumanCountries = () => useCountryFiltering(isHumanFilter);
const isAiFilter = (x: EnhancedCountryInfo) => !x.is_human;
export const useAiCountries = () => useCountryFiltering(isAiFilter);
const isAliveAiFilter = (x: EnhancedCountryInfo) => !x.is_human && x.existed;
export const useExistedAiCountries = () => useCountryFiltering(isAliveAiFilter);

export const useIsDatePickerEnabled = () => {
  const mode = useEu4MapMode();
  return dateEnabledMapMode(mode);
};

export const dateEnabledMapMode = (mode: MapPayload["kind"]) => {
  return mode === "political" || mode === "religion" || mode === "battles";
};

const timelineKindForMode = (mode: MapPayload["kind"]): TimelineKind =>
  mode === "religion" || mode === "battles" ? mode : "political";

/**
 * The timeline of the current map mode. A mode's timeline is read before
 * the mode is entered, so the political one only stands in for modes
 * without a date, where no timeline is shown.
 */
export const selectTimeline = (state: Pick<Eu4State, "mapMode" | "timelines">): TimelineData =>
  state.timelines[timelineKindForMode(state.mapMode)] ?? state.timelines.political;

export const selectTotalDays = (state: Pick<Eu4State, "mapMode" | "timelines">) => {
  const timeline = selectTimeline(state);
  return daysBetween(timeline.start, timeline.end);
};

type DateSelection = Pick<Eu4State, "mapMode" | "timelines" | "mapDayOffset"> & {
  save: Pick<Eu4State["save"], "meta">;
};

/** The date the map shows, as the rest of the analysis reads it. */
export const selectDate = (state: DateSelection) => {
  const meta = state.save.meta;
  if (!dateEnabledMapMode(state.mapMode)) {
    return {
      kind: "disabled",
      days: meta.total_days,
      text: meta.date,
      enabledDays: undefined,
    } as const;
  }

  const days = state.mapDayOffset;
  const isCustom = days !== meta.total_days;
  return {
    kind: isCustom ? "custom" : "latest",
    days,
    text: isCustom ? formatIsoDate(addDays(selectTimeline(state).start, days)) : meta.date,
    enabledDays: isCustom ? days : undefined,
  } as const;
};

export const useSelectedDate = () => {
  const mapMode = useEu4MapMode();
  const meta = useEu4Meta();
  const timelines = useEu4Store((x) => x.timelines);
  const mapDayOffset = useEu4TimelineMapDay();
  return useMemo(
    () => selectDate({ mapMode, save: { meta }, timelines, mapDayOffset }),
    [mapMode, meta, timelines, mapDayOffset],
  );
};

type PersistedMapSettings = {
  renderTerrain: boolean;
  showProvinceBorders: boolean;
  showCountryBorders: boolean;
  showMapModeBorders: boolean;
};

function persistMapSettings(settings: PersistedMapSettings) {
  localStorage.setItem("map-settings", JSON.stringify(settings));
}

export function loadSettings(): PersistedMapSettings {
  const deprecatedSettings = {
    renderTerrain: !!JSON.parse(localStorage.getItem("map-show-terrain") ?? "false"),
  };

  const mapSettings = JSON.parse(localStorage.getItem("map-settings") ?? "{}");
  return {
    ...deprecatedSettings,
    ...mapSettings,
  };
}
