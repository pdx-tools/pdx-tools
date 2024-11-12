import { compatibilityReport } from "@/lib/compatibility";
import { check } from "@/lib/isPresent";
import { MapController } from "map";
import { pdxApi } from "@/services/appApi";
import { createContext, useContext, useMemo } from "react";
import { type StoreApi, createStore, useStore } from "zustand";
import { type MapPayload, mapModes } from "../types/map";
import type {
  CountryMatcher,
  AchievementsScore,
  EnhancedCountryInfo,
  MapDate,
  CountryTag,
} from "../types/models";
import { getEu4Worker } from "../worker";
import type {
  EnhancedMeta,
  FileObservationFrequency,
  MapTimelapseItem,
} from "../worker/module";
import { proxy } from "comlink";
import { emitEvent } from "@/lib/events";

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
    saveInfo:
      | { kind: "sync"; data: string }
      | { kind: "async"; saveId: string };
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
  selectedDate: MapDate;
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
    setSelectedDate: (date: Eu4State["selectedDate"] | null) => void;
    setSelectedDateDay: (days: number) => Promise<void>;
    setSelectedDateText: (text: string) => Promise<void>;
    startWatcher: (frequency: FileObservationFrequency) => void;
    stopWatcher: () => void;
    updateProvinceColors: (options?: {
      countryColors?: Uint8Array;
    }) => Promise<void>;
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

export const createEu4Store = async ({
  store: prevStore,
  save,
  map,
  settings,
}: Eu4StoreInit) => {
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
        renderTerrain:
          state.renderTerrain && report.enabled && !report.performanceCaveat,
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

  const store = createStore<Eu4State>()((set, get) => ({
    ...defaults,
    ...prevStore?.getState(),
    save,
    map,
    ...settings,
    selectedTag: save.defaultSelectedCountry,
    selectedDate: selectDefaultDate(save.meta),
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
        const countryColors =
          !dateEnabledMapMode(mode) && dateEnabledMapMode(get().mapMode)
            ? get().save.initialPoliticalMapColors
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
      setSelectedDate: (date: Eu4State["selectedDate"] | null) => {
        if (date !== null) {
          set({ selectedDate: date });
        } else {
          set({ selectedDate: selectDefaultDate(get().save.meta) });
        }
      },
      setSelectedDateDay: async (days: number) => {
        const text = await getEu4Worker().eu4DaysToDate(days);
        get().actions.setSelectedDate({ days, text });
        await get().actions.updateProvinceColors();
        get().map.redrawMap();
      },
      setSelectedDateText: async (text: string) => {
        const days = await getEu4Worker().eu4DateToDays(text);
        if (days === undefined) {
          return;
        }

        get().actions.setSelectedDate({ days, text });
        await get().actions.updateProvinceColors();
        get().map.redrawMap();
      },

      setSelectedTag: (tag: string) =>
        set({ selectedTag: tag, countryDrawerVisible: true }),
      setPrefersPercents: (checked: boolean) =>
        set({ prefereredValueFormat: checked ? "percent" : "absolute" }),
      setShowOneTimeLineItems: (checked: boolean) =>
        set({ showOneTimeLineItems: checked }),
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
      updateProvinceColors: async (options?: {
        countryColors?: Uint8Array;
      }) => {
        const payload = selectMapPayload(get());
        const colors = await getEu4Worker().eu4MapColors(payload);
        const secondary = get().showSecondaryColor
          ? colors.secondary
          : colors.primary;
        get().map.updateProvinceColors(colors.primary, secondary, {
          country: options?.countryColors ?? colors.country,
        });
      },
      updateMap: (frame: MapTimelapseItem) => {
        get().actions.setSelectedDate(frame.date);
        const stripes = get().showSecondaryColor
          ? frame.secondary
          : frame.primary;
        get().map.updateProvinceColors(frame.primary, stripes, {
          country: frame.country,
        });
      },
      async updateSave({ meta, achievements, countries }) {
        set({
          save: {
            ...get().save,
            meta,
            achievements,
            countries,
          },
          selectedDate: selectDefaultDate(meta),
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

const selectDefaultDate = (meta: EnhancedMeta) => ({
  text: meta.date,
  days: meta.total_days,
});

const selectSaveVersion = (state: Eu4State) =>
  `${state.save.meta.savegame_version.first}.${state.save.meta.savegame_version.second}`;

export const selectMapPayload = (state: Eu4State): MapPayload => ({
  kind: state.mapMode,
  tagFilter: state.countryFilter,
  date: selectDate(state.mapMode, state.save.meta, state.selectedDate)
    .enabledDays,
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
export const useShowProvinceBorders = () =>
  useEu4Store((x) => x.showProvinceBorders);
export const useShowCountryBorders = () =>
  useEu4Store(selectShowCountryBorders);
export const selectShowCountryBorders = (x: Eu4State) =>
  x.mapMode == "political" ? x.showMapModeBorders : x.showCountryBorders;
export const useShowMapModeBorders = () =>
  useEu4Store((x) => x.showMapModeBorders);
export const usePaintSubjectInOverlordHue = () =>
  useEu4Store((x) => x.paintSubjectInOverlordHue);
export const useEu4Meta = () => useEu4Store((x) => x.save.meta);
export const useAchievements = () => useEu4Store((x) => x.save.achievements);
export const useSelectedTag = () => useEu4Store((x) => x.selectedTag);
export const useTagFilter = () => useEu4Store((x) => x.countryFilter);
export const useValueFormatPreference = () =>
  useEu4Store((x) => x.prefereredValueFormat);
export const useShowOnetimeLineItems = () =>
  useEu4Store((x) => x.showOneTimeLineItems);
export const useCountryDrawerVisible = () =>
  useEu4Store((x) => x.countryDrawerVisible);
export const useWatcher = () => useEu4Store((x) => x.watcher);
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
  const outputName =
    nameInd == -1 ? `${filename}` : `${filename.substring(0, nameInd)}`;

  return `${outputName}${suffix}`;
};

export const useCountryNameLookup = () => {
  const countries = useEu4Countries();
  return useMemo(
    () => new Map(countries.map((x) => [x.normalizedName, x])),
    [countries],
  );
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

const dateEnabledMapMode = (mode: MapPayload["kind"]) => {
  return mode === "political" || mode === "religion" || mode === "battles";
};

export const selectDate = (
  mode: MapPayload["kind"],
  meta: EnhancedMeta,
  date: MapDate,
) => {
  if (!dateEnabledMapMode(mode)) {
    return {
      kind: "disabled",
      days: meta.total_days,
      text: meta.date,
      enabledDays: undefined,
    } as const;
  }

  const isCustom = date.days !== meta.total_days;
  return {
    ...date,
    kind: isCustom ? "custom" : "latest",
    enabledDays: isCustom ? date.days : undefined,
  } as const;
};

export const useSelectedDate = () => {
  const selectedDate = useEu4Store((x) => x.selectedDate);
  const mode = useEu4MapMode();
  const meta = useEu4Meta();
  return useMemo(
    () => selectDate(mode, meta, selectedDate),
    [mode, meta, selectedDate],
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
    renderTerrain: !!JSON.parse(
      localStorage.getItem("map-show-terrain") ?? "false",
    ),
  };

  const mapSettings = JSON.parse(localStorage.getItem("map-settings") ?? "{}");
  return {
    ...deprecatedSettings,
    ...mapSettings,
  };
}
