import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { fetchOk } from "@/lib/fetch";
import { check } from "@/lib/isPresent";
import { logMs } from "@/lib/log";
import { emitEvent } from "@/lib/plausible";
import { timeit, timeSync } from "@/lib/timeit";
import { getDataUrls } from "@/lib/urls";
import { GLResources } from "@/map/glResources";
import { IMG_HEIGHT, IMG_WIDTH, WebGLMap } from "@/map/map";
import { MapShader } from "@/map/mapShader";
import { ProvinceFinder } from "@/map/ProvinceFinder";
import { startCompilation } from "@/map/shaderCompiler";
import { XbrShader } from "@/map/xbrShader";
import { useSaveQuery } from "@/services/appApi";
import {
  createContext,
  Dispatch,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { createStore, StoreApi, useStore } from "zustand";
import { captureException } from "../errors";
import {
  glContext,
  shaderUrls,
  fetchProvinceUniqueIndex,
  resourceUrls,
  provinceIdToColorIndexInvert,
  loadTerrainOverlayImages,
} from "./features/map/resources";
import { MapPayload } from "./types/map";
import {
  Achievements,
  CountryMatcher,
  EnhancedCountryInfo,
  EnhancedMeta,
  MapDate,
} from "./types/models";
import { getEu4Worker } from "./worker";

export type Eu4SaveProps =
  | { kind: "local"; file: File }
  | { kind: "server"; saveId: string }
  | { kind: "skanderbeg"; skanId: string };

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

type Eu4Store = StoreApi<Eu4State>;
type Eu4StoreInit = Eu4StateProps & { store: Eu4Store | null };
const createEu4Store = ({ store: prevStore, save, map }: Eu4StoreInit) => {
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

  return store;
};

const Eu4SaveContext = createContext<Eu4Store | null>(null);
type Eu4SaveProviderProps = React.PropsWithChildren<{ store: Eu4Store }>;
export function Eu4SaveProvider({ children, store }: Eu4SaveProviderProps) {
  return (
    <Eu4SaveContext.Provider value={store}>{children}</Eu4SaveContext.Provider>
  );
}

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

export function useEu4Save<T>(
  selector: (state: Eu4State) => T,
  equalityFn?: (left: T, right: T) => boolean
): T {
  return useStore(useEu4Context(), selector, equalityFn);
}

export const useEu4Map = () => useEu4Save((x) => x.map);
export const useEu4Actions = () => useEu4Save((x) => x.actions);
export const useEu4MapMode = () => useEu4Save((x) => x.mapMode);
export const useTerrainOverlay = () => useEu4Save((x) => x.renderTerrain);
export const useMapShowStripes = () => useEu4Save((x) => x.showSecondaryColor);
export const useShowProvinceBorders = () =>
  useEu4Save((x) => x.showProvinceBorders);
export const useShowCountryBorders = () =>
  useEu4Save((x) => x.showCountryBorders);
export const useShowMapModeBorders = () =>
  useEu4Save((x) => x.showMapModeBorders);
export const usePaintSubjectInOverlordHue = () =>
  useEu4Save((x) => x.paintSubjectInOverlordHue);
export const useEu4Meta = () => useEu4Save((x) => x.save.meta);
export const useAchievements = () => useEu4Save((x) => x.save.achievements);
export const useSelectedTag = () => useEu4Save((x) => x.selectedTag);
export const useTagFilter = () => useEu4Save((x) => x.countryFilter);
export const useValueFormatPreference = () =>
  useEu4Save((x) => x.prefereredValueFormat);
export const useShowOnetimeLineItems = () =>
  useEu4Save((x) => x.showOneTimeLineItems);

export function useEu4ModList() {
  const meta = useEu4Meta();

  return meta.mod_enabled.length > 0
    ? meta.mod_enabled
    : meta.mods_enabled_names.map((x) => x.name);
}

export const useIsServerSaveFile = () => {
  const info = useEu4Save((x) => x.save.saveInfo);
  return info.kind === "async";
};

export const useServerSaveFile = () => {
  const info = useEu4Save((x) => x.save.saveInfo);
  const id = info.kind === "async" ? info.saveId : "";
  const saveQuery = useSaveQuery(id, { enabled: !!id });
  return saveQuery.data;
};

export const useSaveFilename = () => {
  const info = useEu4Save((x) => x.save.saveInfo);
  const serverFile = useServerSaveFile();
  if (info.kind === "sync") {
    return info.data;
  } else {
    return serverFile?.filename ?? "savegame.eu4";
  }
};

export const useCountryNameLookup = () => {
  const countries = useEu4Save((x) => x.save.countries);
  return useMemo(
    () => new Map(countries.map((x) => [x.normalizedName, x])),
    [countries]
  );
};

const useCountryFiltering = (cb: (arg: EnhancedCountryInfo) => boolean) => {
  const countries = useEu4Save((x) => x.save.countries).filter(cb);
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
  const selectedDate = useEu4Save((x) => x.selectedDate);
  const isEnabled = useIsDatePickerEnabled();
  const meta = useEu4Meta();
  return isEnabled
    ? selectedDate
    : {
        days: meta.total_days,
        text: meta.date,
      };
};

type Eu4LoadState = {
  loading: {
    percent: number;
  } | null;
  data: Eu4Store | null;
  error: unknown | null;
};

type Eu4LoadActions =
  | { kind: "start" }
  | { kind: "progress"; value: number }
  | { kind: "data"; data: Eu4Store }
  | { kind: "error"; error: unknown };

const loadStateReducer = (
  state: Eu4LoadState,
  action: Eu4LoadActions
): Eu4LoadState => {
  switch (action.kind) {
    case "start": {
      return {
        ...state,
        error: null,
        loading: {
          percent: 0,
        },
      };
    }
    case "progress": {
      return {
        ...state,
        loading: {
          percent: (state.loading?.percent ?? 0) + action.value,
        },
      };
    }
    case "data": {
      return {
        ...state,
        loading: null,
        data: action.data,
      };
    }
    case "error": {
      return {
        ...state,
        error: action.error,
      };
    }
  }
};

type Task<T> = {
  fn: () => T | Promise<T>;
  name: string;
  progress: number;
};

function runTask<T>(
  dispatch: Dispatch<Eu4LoadActions>,
  { fn, name, progress }: Task<T>
) {
  return timeit(fn).then((res) => {
    logMs(res, name);
    dispatch({ kind: "progress", value: progress });
    return res.data;
  });
}

function getSaveInfo(
  save: Eu4SaveProps
): { kind: "async"; saveId: string } | { kind: "sync"; data: string } {
  switch (save.kind) {
    case "server":
      return { kind: "async", saveId: save.saveId };
    case "local":
      return { kind: "sync", data: save.file.name };
    case "skanderbeg":
      return { kind: "sync", data: "savegame.eu4" };
  }
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

function focusCameraOn(
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

async function loadTerrainImages(map: WebGLMap, version: string) {
  const images = await loadTerrainOverlayImages(version);
  map.updateTerrainTextures(images);
}

async function loadEu4Save(
  save: Eu4SaveProps,
  mapCanvas: HTMLCanvasElement,
  dispatch: Dispatch<Eu4LoadActions>
) {
  dispatch({ kind: "start" });
  const worker = getEu4Worker();
  emitEvent({ kind: "parse", game: "eu4" });
  const gl = check(glContext(mapCanvas), "unable to acquire webgl2 context");

  const shadersTask = runTask(dispatch, {
    fn: () => shaderUrls(),
    name: "fetch shaders",
    progress: 3,
  });

  const initTasks = Promise.all([
    runTask(dispatch, {
      fn: () => worker.initializeWasm(),
      name: "initialized eu4 wasm",
      progress: 7,
    }),

    runTask(dispatch, {
      fn: () => worker.fetchData(save),
      name: "save data read",
      progress: 7,
    }),
  ]);

  const shaders = await shadersTask;
  const compileTask = timeSync(() => startCompilation(gl, shaders));
  dispatch({ kind: "progress", value: 3 });
  logMs(
    compileTask,
    `init shader compilation - non-blocking: ${compileTask.data.nonBlocking}`
  );

  await initTasks;
  const { version } = await runTask(dispatch, {
    fn: () => worker.parseMeta(),
    name: "parsed eu4 metadata",
    progress: 5,
  });

  const [gameData, provincesUniqueIndex] = await Promise.all([
    runTask(dispatch, {
      fn: () =>
        fetchOk(getDataUrls(version))
          .then((x) => x.arrayBuffer())
          .then((x) => new Uint8Array(x)),
      name: `fetch game data (${version})`,
      progress: 3,
    }),
    runTask(dispatch, {
      fn: () => fetchProvinceUniqueIndex(version),
      name: "fetch province unique index",
      progress: 3,
    }),
  ]);

  const resourceTask = runTask(dispatch, {
    fn: () => resourceUrls(version),
    name: "textures fetched and bitmapped",
    progress: 7,
  });

  await runTask(dispatch, {
    fn: () => worker.eu4InitialParse(gameData, provincesUniqueIndex),
    name: "initial parse",
    progress: 20,
  });

  const provinceCountryColors = await runTask(dispatch, {
    fn: () => worker.eu4InitialMapColors(),
    name: "initial map colors",
    progress: 3,
  });

  const saveTask = runTask(dispatch, {
    fn: () => worker.eu4GameParse(),
    name: "full save parse",
    progress: 20,
  });

  const resources = await resourceTask;
  const glResourcesInit = GLResources.create(
    gl,
    resources,
    provinceCountryColors
  );

  const [mapProgram, xbrProgram] = await runTask(dispatch, {
    fn: () => compileTask.data.compilationCompletion(),
    name: "shader linkage",
    progress: 5,
  });

  const glResources = new GLResources(
    ...glResourcesInit,
    MapShader.create(gl, mapProgram),
    XbrShader.create(gl, xbrProgram)
  );

  const colorIndexToProvinceId =
    provinceIdToColorIndexInvert(provincesUniqueIndex);

  const finder = new ProvinceFinder(
    resources.provinces1,
    resources.provinces2,
    resources.provincesUniqueColor,
    colorIndexToProvinceId
  );

  const { meta, achievements, defaultSelectedTag } = await saveTask;
  const [countries, mapPosition] = await Promise.all([
    runTask(dispatch, {
      fn: () => worker.eu4GetCountries(),
      name: "get countries",
      progress: 3,
    }),

    runTask(dispatch, {
      fn: () => worker.eu4InitialMapPosition(),
      name: "initial map position",
      progress: 3,
    }),
  ]);

  const map = new WebGLMap(gl, glResources, finder);
  const rect = document.body.getBoundingClientRect();
  map.resize(rect.width, rect.height);

  const [primary, secondary] = await runTask(dispatch, {
    fn: () =>
      worker.eu4MapColors({
        date: null,
        kind: "political",
        paintSubjectInOverlordHue: false,
        showSecondaryColor: false,
        tagFilter: initialEu4CountryFilter,
      }),
    name: "calculate political map",
    progress: 4,
  });
  map.updateProvinceColors(primary, secondary);

  if (!meta.multiplayer) {
    map.scale = map.maxScale * (1 / 4);
    focusCameraOn(map, mapPosition);
  }

  const saveInfo = getSaveInfo(save);

  return {
    map,
    meta,
    achievements,
    countries,
    defaultSelectedCountry: defaultSelectedTag,
    saveInfo,
    version,
  };
}

const useMapContainer = (map: WebGLMap | null | undefined) => {
  const mapContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mapContainer.current == null || map == null) {
      return;
    }

    const container = mapContainer.current;
    let resiveObserverAF = 0;
    const ro = new ResizeObserver((_entries) => {
      // Why resive observer has RAF: https://stackoverflow.com/a/58701523
      cancelAnimationFrame(resiveObserverAF);
      resiveObserverAF = requestAnimationFrame(() => {
        const bounds = container.getBoundingClientRect();
        map.resize(bounds.width, bounds.height);
        map.redrawViewport();
      });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
    };
  }, [map]);

  return mapContainer;
};

export const useLoadEu4 = (save: Eu4SaveProps) => {
  const mapCanvas = useRef<HTMLCanvasElement>(null);
  const [{ loading, data, error }, dispatch] = useReducer(loadStateReducer, {
    loading: null,
    data: null,
    error: null,
  });

  const storeRef = useRef(data);
  useIsomorphicLayoutEffect(() => {
    storeRef.current = data;
  });

  const mapContainer = useMapContainer(data?.getState().map);

  useEffect(() => {
    if (mapCanvas.current === null) {
      return;
    }

    loadEu4Save(save, mapCanvas.current, dispatch)
      .then(async ({ map, version, ...rest }) => {
        const store = createEu4Store({
          store: storeRef.current,
          save: rest,
          map,
        });

        const state = store.getState();
        if (state.renderTerrain) {
          await loadTerrainImages(map, version);
        }

        const [primary, secondary] = await getEu4Worker().eu4MapColors(
          selectMapPayload(state)
        );

        map.updateProvinceColors(primary, secondary);
        await runTask(dispatch, {
          fn: () =>
            new Promise((res) =>
              requestAnimationFrame(() => {
                map.onDraw = () => res(void 0);
                map.redrawMapImage();
              })
            ),
          name: "first render",
          progress: 4,
        });

        dispatch({ kind: "data", data: store });
      })
      .catch((error) => {
        dispatch({ kind: "error", error });
        captureException(error);
      });
  }, [save]);

  return { loading, data, error, mapCanvas, mapContainer };
};
