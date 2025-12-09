import { useEffect, useReducer, useRef } from "react";
import { createLoadedEngine } from "../ui-engine";
import type { AppEngine } from "../ui-engine";
import { createEu5Store } from "./eu5Store";
import type { Eu5Store } from "./eu5Store";
import { timeAsync } from "@/lib/timeit";
import { pdxAbortController } from "@/lib/abortController";
import { captureException } from "@/lib/captureException";
import { emitEvent } from "@/lib/events";
import { isWebGPUSupported } from "@/lib/compatibility";

export type Eu5SaveInput =
  | { kind: "file"; file: File }
  | { kind: "handle"; file: FileSystemFileHandle; name: string };

type Eu5LoadState = {
  loading: {
    percent: number;
  } | null;
  data: Eu5Store | null;
  error: unknown | null;
  mapCanvas: React.RefObject<HTMLCanvasElement | null>;
  mapContainer: React.RefObject<HTMLDivElement | null>;
};

type Eu5LoadActions =
  | { kind: "start" }
  | { kind: "progress"; value: number }
  | { kind: "data"; data: Eu5Store }
  | { kind: "error"; error: unknown };

const loadStateReducer = (
  state: Eu5LoadState,
  action: Eu5LoadActions,
): Eu5LoadState => {
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
        loading: null,
        error: action.error,
      };
    }
  }
};

type Task<T> = {
  fn: () => T | Promise<T>;
  name: string;
};

async function runTask<T>({ fn, name }: Task<T>) {
  return timeAsync(name, fn);
}

async function loadEu5Save(
  saveInput: Eu5SaveInput,
  mapCanvas: OffscreenCanvas,
  mapContainer: HTMLElement,
  signal: AbortSignal,
  dispatch: React.Dispatch<Eu5LoadActions>,
) {
  const run = async <T,>(task: Task<T>) => {
    signal.throwIfAborted();
    const result = await runTask(task);
    signal.throwIfAborted();
    return result;
  };

  // Extract filename from variant
  const filename =
    saveInput.kind === "handle" ? saveInput.name : saveInput.file.name;

  const { engine, saveDate, playthroughName } = await run({
    fn: () =>
      createLoadedEngine(
        saveInput,
        {
          offscreen: mapCanvas,
          container: mapContainer,
        },
        (increment: number) => {
          dispatch({ kind: "progress", value: increment });
        },
      ),
    name: "Create EU5 Engine",
  });

  emitEvent({ kind: "Save parsed", game: "eu5", source: "local" });

  const store = createEu5Store(engine, filename, saveDate, playthroughName);
  return { store, engine };
}

export function useLoadEu5(save: Eu5SaveInput) {
  const mapCanvas = useRef<HTMLCanvasElement | null>(null);
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AppEngine | null>(null);

  const [{ loading, data, error }, dispatch] = useReducer(loadStateReducer, {
    loading: null,
    data: null,
    error: null,
    mapCanvas,
    mapContainer,
  });

  useEffect(() => {
    if (!mapCanvas.current || !mapContainer.current) {
      return;
    }

    // Check if canvas has already been transferred
    if (mapCanvas.current.dataset.transferred === "true") {
      console.warn(
        "Canvas already transferred, cannot reload. Component needs remount with fresh canvas.",
      );
      return;
    }

    // Check WebGPU compatibility before attempting to load
    if (!isWebGPUSupported()) {
      dispatch({
        kind: "error",
        error: new Error("WebGPU is not supported in your browser"),
      });
      return;
    }

    const offscreenCanvas = mapCanvas.current.transferControlToOffscreen();
    mapCanvas.current.dataset.transferred = "true";

    dispatch({ kind: "start" });
    const controller = pdxAbortController();

    loadEu5Save(
      save,
      offscreenCanvas,
      mapContainer.current!,
      controller.signal,
      dispatch,
    )
      .then(({ store, engine }) => {
        engineRef.current = engine;
        dispatch({ kind: "data", data: store });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        dispatch({ kind: "error", error });
        captureException(error);
      });
  }, [save]);

  return { loading, data, error, mapCanvas, mapContainer };
}
