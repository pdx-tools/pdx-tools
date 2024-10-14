import { transfer, wrap } from "comlink";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { fetchOk } from "@/lib/fetch";
import { log, logMs } from "@/lib/log";
import { emitEvent, startSessionRecording } from "@/lib/events";
import { timeit } from "@/lib/timeit";
import { type MapWorker, MapController, createMapWorker, InitToken } from "map";
import { Dispatch, useRef, useEffect, useReducer } from "react";
import {
  shaderUrls,
  fetchProvinceUniqueIndex,
  resourceUrls,
} from "../features/map/resources";
import { getEu4Worker } from "../worker";
import {
  Eu4Store,
  initialEu4CountryFilter,
  createEu4Store,
  loadSettings,
} from "./eu4Store";
import { dataUrls, gameVersion } from "@/lib/game_gen";
import { pdxAbortController } from "@/lib/abortController";
import { downloadData } from "@/lib/downloadData";
import { check } from "@/lib/isPresent";
import { captureException } from "@/lib/captureException";

export type Eu4SaveInput =
  | { kind: "file"; file: File }
  | { kind: "handle"; file: FileSystemFileHandle; name: string }
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
  action: Eu4LoadActions,
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
  { fn, name, progress }: Task<T>,
) {
  return timeit(fn).then((res) => {
    logMs(res, name);
    dispatch({ kind: "progress", value: progress });
    return res.data;
  });
}

function getSaveInfo(
  save: Eu4SaveInput,
): { kind: "async"; saveId: string } | { kind: "sync"; data: string } {
  switch (save.kind) {
    case "server":
      return { kind: "async", saveId: save.saveId };
    case "file":
      return { kind: "sync", data: save.file.name };
    case "handle":
      return { kind: "sync", data: save.name };
    case "skanderbeg":
      return { kind: "sync", data: "savegame.eu4" };
  }
}

let initTokenTask: Promise<InitToken> | undefined;
let mapWorker: undefined | ReturnType<typeof createMapComlink>;
function createMapComlink() {
  return wrap<MapWorker>(new Worker(new URL("../../map/map-worker-bridge.ts", import.meta.url), {
    type: "module",
  }));
}
export function getMapWorker() {
  return (mapWorker ??= createMapComlink());
}

function hasTransferredOffscreen(canvas: HTMLCanvasElement) {
  return !!canvas.getAttribute("data-offscreen");
}

async function loadEu4Save(
  save: Eu4SaveInput,
  mapCanvas: HTMLCanvasElement,
  dispatch: Dispatch<Eu4LoadActions>,
  mapContainer: HTMLElement,
  signal: AbortSignal,
  eagerLoadTerrain: boolean,
) {
  const run = async <T,>(task: Task<T>) => {
    signal.throwIfAborted();
    const result = await runTask(dispatch, task);
    signal.throwIfAborted();
    return result;
  };

  dispatch({ kind: "start" });
  const worker = getEu4Worker();

  // startSessionRecording();
  const mapWorker = getMapWorker();
  const shadersTask = hasTransferredOffscreen(mapCanvas)
    ? check(initTokenTask, "empty init token task")
    : (initTokenTask = new Promise<InitToken>((res, reject) => {
        const bounds = mapContainer.getBoundingClientRect();
        mapCanvas.width = bounds.width * window.devicePixelRatio;
        mapCanvas.height = bounds.height * window.devicePixelRatio;
        mapCanvas.style.width = `${bounds.width}px`;
        mapCanvas.style.height = `${bounds.height}px`;
        const offscreen = mapCanvas.transferControlToOffscreen();
        mapCanvas.setAttribute("data-offscreen", "true");
        return runTask(dispatch, {
          fn: () =>
            mapWorker.init(transfer(offscreen, [offscreen]), shaderUrls()),
          name: "shader compilation",
          progress: 10,
        }).then(res, reject);
      }));

  const initTasks = Promise.all([
    run({
      fn: () => worker.initializeWasm(),
      name: "initialized eu4 wasm",
      progress: 7,
    }),

    run({
      fn: () => worker.fetchData(save),
      name: "save data read",
      progress: 7,
    }),
  ]);

  await initTasks;
  const { version } = await run({
    fn: () => worker.parseMeta(),
    name: "parsed eu4 metadata",
    progress: 5,
  });

  emitEvent({
    kind: "Save parsed",
    game: "eu4",
    source: save.kind === "server" ? "remote" : "local",
  });

  const resources = resourceUrls(version);

  const mapControllerTask = Promise.all([
    shadersTask,
    run({
      fn: () =>
        mapWorker.withResources(
          {
            provinces1: resources.provinces1,
            provinces2: resources.provinces2,
            terrain1: resources.terrain1,
            terrain2: resources.terrain2,
            stripes: resources.stripes,
          },
          resources.provincesUniqueColor,
          resources.provincesUniqueIndex,
        ),
      name: "textures fetched and bitmapped",
      progress: 10,
    }),
    run({
      fn: () =>
        mapWorker.withTerrainImages(
          {
            colorMap: resources.colorMap,
            sea: resources.sea,
            normal: resources.normal,
            rivers1: resources.rivers1,
            rivers2: resources.rivers2,
            water: resources.water,
            surfaceRock: resources.surfaceRock,
            surfaceGreen: resources.surfaceGreen,
            surfaceNormalRock: resources.surfaceNormalRock,
            surfaceNormalGreen: resources.surfaceNormalGreen,
            heightMap: resources.heightmap,
          },
          { eager: eagerLoadTerrain },
        ),
      name: "primed terrain textures",
      progress: 10,
    }),
  ])
    .then(([init, resources, terrain]) =>
      run({
        fn: () =>
          mapWorker.withMap(window.devicePixelRatio, init, resources, terrain),
        name: "constructed offscreen worker",
        progress: 5,
      }),
    )
    .then((map) => new MapController(mapWorker, map, mapCanvas, mapContainer));

  const [gameData, provincesUniqueIndex] = await Promise.all([
    run({
      fn: () =>
        fetchOk(dataUrls(gameVersion(version)))
          .then((x) => x.arrayBuffer())
          .then((x) => new Uint8Array(x)),
      name: `fetch game data (${version})`,
      progress: 3,
    }),
    run({
      fn: () => fetchProvinceUniqueIndex(version),
      name: "fetch province unique index",
      progress: 3,
    }),
  ]);

  const saveTask = run({
    fn: () => worker.eu4GameParse(gameData, provincesUniqueIndex),
    name: "save deserialized",
    progress: 40,
  });

  signal.throwIfAborted();

  const { meta, achievements, defaultSelectedTag } = await saveTask;
  const [countries, mapPosition] = await Promise.all([
    run({
      fn: () => worker.eu4GetCountries(),
      name: "get countries",
      progress: 3,
    }),

    run({
      fn: () => worker.eu4InitialMapPosition(),
      name: "initial map position",
      progress: 3,
    }),
  ]);

  const { primary, secondary } = await run({
    fn: () =>
      worker.eu4MapColors({
        date: undefined,
        kind: "political",
        paintSubjectInOverlordHue: false,
        tagFilter: initialEu4CountryFilter,
      }),
    name: "calculate political map",
    progress: 4,
  });

  const map = await mapControllerTask;
  map.updateProvinceColors(primary, secondary, { country: primary });

  if (!meta.multiplayer) {
    map.setScaleOfMax(0.25);
    map.moveCameraTo({ x: mapPosition[0], y: mapPosition[1] });
  }

  const saveInfo = getSaveInfo(save);

  return {
    map,
    meta,
    achievements,
    countries,
    initialPoliticalMapColors: primary,
    defaultSelectedCountry: defaultSelectedTag,
    saveInfo,
  };
}

const useMapContainer = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
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

  const mapContainer = useMapContainer();

  useEffect(() => {
    if (mapCanvas.current === null || mapContainer.current === null) {
      return;
    }

    const controller = pdxAbortController();
    const settings = loadSettings();
    loadEu4Save(
      save,
      mapCanvas.current,
      dispatch,
      mapContainer.current,
      controller.signal,
      settings.renderTerrain,
    )
      .then(async ({ map, ...rest }) => {
        storeRef.current?.getState().map.dispose?.();

        // Attach a function to the window so that puppeteer can wait for the
        // screenshot to be generated. Download the screenshot as puppeteer
        // doesn't support transferring blobs:
        // https://github.com/puppeteer/puppeteer/issues/3722
        (window as any).pdxScreenshot = async () => {
          const fontFamily = getComputedStyle(document.body).fontFamily;
          const date = storeRef.current?.getState().selectedDate.text;
          const result = await map.screenshot({
            kind: "viewport",
            date,
            fontFamily,
          });
          downloadData(result, "image.png");
        };

        const store = await createEu4Store({
          store: storeRef.current,
          save: rest,
          map,
          settings,
        });

        map.attachDOMHandlers();

        await runTask(dispatch, {
          fn: () => map.redrawMap(),
          name: "first render",
          progress: 4,
        });

        dispatch({ kind: "data", data: store });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          log("ignoring signal abortion");
          return;
        }

        dispatch({ kind: "error", error });
        captureException(error);
      });

    return () => {
      controller.abort("cancelling save load");
    };
  }, [save, mapContainer]);

  useEffect(() => {
    const canvas = mapCanvas.current;
    if (canvas === null) {
      return;
    }

    function glLost(e: Event) {
      const evt = e as WebGLContextEvent;
      const error = new Error(
        `PDX Tools map crashed with webgl context lost.${
          evt.statusMessage && ` Additional info: ${evt.statusMessage}.`
        } This may indicate an issue in PDX Tools or browser. To help diagnose the bug, consider trying other browsers and attaching WebGL report (https://webglreport.com/?v=2) and GPU status (ie: \`chrome://gpu\`).`,
      );
      dispatch({ kind: "error", error });
      captureException(error);
    }

    canvas.addEventListener("webglcontextlost", glLost);
    return () => {
      canvas.removeEventListener("webglcontextlost", glLost);
    };
  }, [mapCanvas]);

  return { loading, data, error, mapCanvas, mapContainer };
};
