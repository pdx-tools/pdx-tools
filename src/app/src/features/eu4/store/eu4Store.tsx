import { check } from "@/lib/isPresent";
import { IMG_HEIGHT, IMG_WIDTH, WebGLMap } from "@/map/map";
import { useSaveQuery } from "@/services/appApi";
import { createContext, useContext, useMemo } from "react";
import { StoreApi, createStore, useStore } from "zustand";
import { loadTerrainOverlayImages } from "../features/map/resources";
import { MapPayload } from "../types/map";
import {
  CountryMatcher,
  EnhancedMeta,
  Achievements,
  EnhancedCountryInfo,
  MapDate,
} from "../types/models";
import { getEu4Worker } from "../worker";

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
    achievements: Achievements;
    countries: EnhancedCountryInfo[];
    defaultSelectedCountry: string;
    saveInfo:
      | { kind: "sync"; data: string }
      | { kind: "async"; saveId: string };
  };
  map: WebGLMap;
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
  selectedDate: MapDate;
  showOneTimeLineItems: boolean;
  prefereredValueFormat: "absolute" | "percent";
  actions: {
    panToTag: (tag: string, offset?: number) => Promise<void>;
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
    setSelectedDate: (date: Eu4State["selectedDate"]) => Promise<void>;
    setSelectedDateDay: (days: number) => Promise<void>;
    setSelectedDateText: (text: string) => Promise<void>;
    updateProvinceColors: () => Promise<void>;
    updateTagFilter: (matcher: Partial<CountryMatcher>) => Promise<void>;
    zoomIn: () => void;
    zoomOut: () => void;
  };
};

export type Eu4Store = StoreApi<Eu4State>;
type Eu4StoreInit = Eu4StateProps & { store: Eu4Store | null };
export const Eu4SaveContext = createContext<Eu4Store | null>(null);

export const createEu4Store = async ({
  store: prevStore,
  save,
  map,
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
  } as const;

  const settings = savedSettings();
  const store = createStore<Eu4State>()((set, get) => ({
    ...defaults,
    ...prevStore?.getState(),
    save,
    map,
    ...settings,
    selectedTag: save.defaultSelectedCountry,
    selectedDate: {
      text: save.meta.date,
      days: save.meta.total_days,
    },
    actions: {
      panToTag: async (tag, offset?: number) => {
        const pos = await getEu4Worker().eu4MapPositionOf(tag);
        map.scale = map.maxScale * (1 / 2);
        focusCameraOn(map, pos, { offsetX: offset });
        map.redrawViewport();
      },
      setMapMode: async (mode: Eu4State["mapMode"]) => {
        set({ mapMode: mode });
        await get().actions.updateProvinceColors();
        get().map.redrawMapImage();
      },
      setMapShowStripes: async (show: boolean) => {
        set({ showSecondaryColor: show });
        await get().actions.updateProvinceColors();
        get().map.redrawMapImage();
      },
      setPaintSubjectInOverlordHue: async (enabled: boolean) => {
        set({ paintSubjectInOverlordHue: enabled });
        await get().actions.updateProvinceColors();
        get().map.redrawMapImage();
      },
      setShowProvinceBorders: (enabled: boolean) => {
        set({ showProvinceBorders: enabled });
        get().map.showProvinceBorders = enabled;
        get().map.redrawMapImage();
      },
      setShowCountryBorders: (enabled: boolean) => {
        set({ showCountryBorders: enabled });
        get().map.showCountryBorders = enabled;
        get().map.redrawMapImage();
      },
      setShowMapModeBorders: (enabled: boolean) => {
        set({ showMapModeBorders: enabled });
        get().map.showMapModeBorders = enabled;
        get().map.redrawMapImage();
      },

      setTerrainOverlay: async (enabled: boolean) => {
        const map = get().map;
        localStorage.setItem("map-show-terrain", JSON.stringify(enabled));
        map.renderTerrain = enabled;
        if (enabled) {
          await loadTerrainImages(map, selectSaveVersion(get()));
        }
        map.redrawMapImage();
        set({ renderTerrain: enabled });
      },
      setSelectedDate: async (date: Eu4State["selectedDate"]) => {
        set({ selectedDate: date });
        await get().actions.updateProvinceColors();
        get().map.redrawMapImage();
      },
      setSelectedDateDay: async (days: number) => {
        const text = await getEu4Worker().eu4DaysToDate(days);
        await get().actions.setSelectedDate({ days, text });
      },
      setSelectedDateText: async (text: string) => {
        const days = await getEu4Worker().eu4DateToDays(text);
        await get().actions.setSelectedDate({ days, text });
      },

      setSelectedTag: (tag: string) => set({ selectedTag: tag }),
      setPrefersPercents: (checked: boolean) =>
        set({ prefereredValueFormat: checked ? "percent" : "absolute" }),
      setShowOneTimeLineItems: (checked: boolean) =>
        set({ showOneTimeLineItems: checked }),

      updateTagFilter: async (matcher: Partial<CountryMatcher>) => {
        const newFilter = { ...get().countryFilter, ...matcher };
        set({ countryFilter: newFilter });
        await get().actions.updateProvinceColors();
        get().map.redrawMapImage();
      },
      updateProvinceColors: async () => {
        const payload = selectMapPayload(get());
        const [primary, secondary] = await getEu4Worker().eu4MapColors(payload);
        get().map.showCountryBorders =
          payload.date !== null ? false : get().showCountryBorders;
        get().map.updateProvinceColors(primary, secondary);
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
  map.renderTerrain = state.renderTerrain;
  map.showProvinceBorders = state.showProvinceBorders;
  map.showCountryBorders = state.showCountryBorders;
  map.showMapModeBorders = state.showMapModeBorders;

  if (map.renderTerrain) {
    await loadTerrainImages(map, selectSaveVersion(state));
  }

  await state.actions.updateProvinceColors();
  return store;
};

const selectSaveVersion = (state: Eu4State) =>
  `${state.save.meta.savegame_version.first}.${state.save.meta.savegame_version.second}`;
export const selectMapPayload = (state: Eu4State): MapPayload => ({
  kind: state.mapMode,
  tagFilter: state.countryFilter,
  date:
    state.selectedDate.days == state.save.meta.total_days
      ? null
      : state.selectedDate.days,
  showSecondaryColor: state.showSecondaryColor,
  paintSubjectInOverlordHue: state.paintSubjectInOverlordHue,
});

export function useEu4Context() {
  return check(useContext(Eu4SaveContext), "Missing Eu4 Save Context");
}

function useEu4Store<T>(
  selector: (state: Eu4State) => T,
  equalityFn?: (left: T, right: T) => boolean
): T {
  return useStore(useEu4Context(), selector, equalityFn);
}

export const useEu4Map = () => useEu4Store((x) => x.map);
export const useEu4Actions = () => useEu4Store((x) => x.actions);
export const useEu4MapMode = () => useEu4Store((x) => x.mapMode);
export const useTerrainOverlay = () => useEu4Store((x) => x.renderTerrain);
export const useMapShowStripes = () => useEu4Store((x) => x.showSecondaryColor);
export const useShowProvinceBorders = () =>
  useEu4Store((x) => x.showProvinceBorders);
export const useShowCountryBorders = () =>
  useEu4Store((x) => x.showCountryBorders);
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
  const saveQuery = useSaveQuery(id, { enabled: !!id });
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

export const useCountryNameLookup = () => {
  const countries = useEu4Store((x) => x.save.countries);
  return useMemo(
    () => new Map(countries.map((x) => [x.normalizedName, x])),
    [countries]
  );
};

const useCountryFiltering = (cb: (arg: EnhancedCountryInfo) => boolean) => {
  const countries = useEu4Store((x) => x.save.countries).filter(cb);
  countries.sort((a, b) => a.tag.localeCompare(b.tag));
  return countries;
};

const isHumanFilter = (x: EnhancedCountryInfo) => x.is_human;
export const useHumanCountries = () => useCountryFiltering(isHumanFilter);
const isAiFilter = (x: EnhancedCountryInfo) => !x.is_human;
export const useAiCountries = () => useCountryFiltering(isAiFilter);
const isAliveAiFilter = (x: EnhancedCountryInfo) => !x.is_human && x.is_alive;
export const useAliveAiCountries = () => useCountryFiltering(isAliveAiFilter);

export const useIsCountryBordersDisabled = () => {
  const mode = useEu4MapMode();
  const date = useSelectedDate();
  const meta = useEu4Meta();
  return (
    (mode == "political" || mode == "religion") && date.days != meta.total_days
  );
};

export const useIsDatePickerEnabled = () => {
  const mode = useEu4MapMode();
  return mode === "political" || mode === "religion";
};

export const useSelectedDate = () => {
  const selectedDate = useEu4Store((x) => x.selectedDate);
  const isEnabled = useIsDatePickerEnabled();
  const meta = useEu4Meta();
  return isEnabled
    ? selectedDate
    : {
        days: meta.total_days,
        text: meta.date,
      };
};

async function loadTerrainImages(map: WebGLMap, version: string) {
  const images = await loadTerrainOverlayImages(version);
  map.updateTerrainTextures(images);
}

function savedSettings() {
  return {
    renderTerrain: !!JSON.parse(
      localStorage.getItem("map-show-terrain") ?? "false"
    ),
  };
}

type FocusCameraOnProps = {
  offsetX: number;
  width: number;
  height: number;
};

export function focusCameraOn(
  map: WebGLMap,
  [x, y]: number[],
  options?: Partial<FocusCameraOnProps>
) {
  const width = options?.width ?? map.gl.canvas.width;
  const height = options?.height ?? map.gl.canvas.height;

  const IMG_ASPECT = IMG_WIDTH / IMG_HEIGHT;
  const initX = ((x - IMG_WIDTH / 2) / (IMG_WIDTH / 2)) * (width / 2);
  const initY =
    (((y - IMG_HEIGHT / 2) / (IMG_HEIGHT / 2)) * (height / 2)) /
    (IMG_ASPECT / (width / height));

  map.focusPoint = [initX, initY];

  if (options?.offsetX) {
    map.focusPoint[0] = initX + options.offsetX / 2 / map.scale;
  }
}
