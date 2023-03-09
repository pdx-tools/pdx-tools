import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { fetchOk } from "@/lib/fetch";
import { check } from "@/lib/isPresent";
import { logMs } from "@/lib/log";
import { emitEvent } from "@/lib/plausible";
import { timeit, timeSync } from "@/lib/timeit";
import { getDataUrls } from "@/lib/urls";
import { GLResources } from "@/map/glResources";
import { WebGLMap } from "@/map/map";
import { MapShader } from "@/map/mapShader";
import { ProvinceFinder } from "@/map/ProvinceFinder";
import { startCompilation } from "@/map/shaderCompiler";
import { XbrShader } from "@/map/xbrShader";
import { captureException } from "@sentry/nextjs";
import { Dispatch, useRef, useEffect, useReducer } from "react";
import {
  glContext,
  shaderUrls,
  fetchProvinceUniqueIndex,
  resourceUrls,
  provinceIdToColorIndexInvert,
} from "../features/map/resources";
import { getEu4Worker } from "../worker";
import {
  Eu4Store,
  initialEu4CountryFilter,
  focusCameraOn,
  createEu4Store,
} from "./eu4Store";

export type Eu4SaveInput =
  | { kind: "local"; file: File }
  | { kind: "server"; saveId: string }
  | { kind: "skanderbeg"; skanId: string };

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
  save: Eu4SaveInput
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

async function loadEu4Save(
  save: Eu4SaveInput,
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
    name: "save parsed",
    progress: 20,
  });

  const provinceCountryColors = await runTask(dispatch, {
    fn: () => worker.eu4InitialMapColors(),
    name: "initial map colors",
    progress: 3,
  });

  const saveTask = runTask(dispatch, {
    fn: () => worker.eu4GameParse(),
    name: "save deserialized",
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

export const useLoadEu4 = (save: Eu4SaveInput) => {
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
      .then(async ({ map, ...rest }) => {
        const store = await createEu4Store({
          store: storeRef.current,
          save: rest,
          map,
        });

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
