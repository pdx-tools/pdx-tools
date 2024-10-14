import { logMs } from "@/lib/log";
import { emitEvent } from "@/lib/events";
import { timeit } from "@/lib/timeit";
import { getVic3Worker } from "../worker";
import { useEffect, useReducer } from "react";
import { pdxAbortController } from "@/lib/abortController";
import { Vic3Store, createVic3Store } from "./vic3Store";
import { captureException } from "@/lib/captureException";

export type Vic3SaveInput =
  | { kind: "file"; file: File }
  | { kind: "handle"; file: FileSystemFileHandle; name: string };

type Task<T> = {
  fn: () => T | Promise<T>;
  name: string;
};

async function loadVic3Save(save: Vic3SaveInput, signal: AbortSignal) {
  const run = async <T>({ fn, name }: Task<T>) => {
    signal.throwIfAborted();
    const result = await timeit(fn).then((res) => {
      logMs(res, name);
      return res.data;
    });
    signal.throwIfAborted();
    return result;
  };

  const worker = getVic3Worker();

  await Promise.all([
    run({
      fn: () => worker.initializeWasm(),
      name: "initialized vic3 wasm",
    }),

    run({
      fn: () => worker.fetchData(save),
      name: "save data read",
    }),
  ]);

  const result = await run({
    fn: () => worker.parseVic3(),
    name: "parse vic3 file",
  });
  emitEvent({ kind: "Save parsed", game: "vic3", source: "local" });

  return result;
}

type Vic3LoadState = {
  loading: boolean;
  data: Vic3Store | null;
  error: unknown | null;
};

type Vic3LoadActions =
  | { kind: "start" }
  | { kind: "data"; data: Vic3Store }
  | { kind: "error"; error: unknown };

const loadStateReducer = (
  state: Vic3LoadState,
  action: Vic3LoadActions,
): Vic3LoadState => {
  switch (action.kind) {
    case "start": {
      return {
        ...state,
        error: null,
        loading: true,
      };
    }
    case "data": {
      return {
        ...state,
        data: action.data,
        loading: false,
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

export function useLoadVic3(save: Vic3SaveInput) {
  const [{ loading, data, error }, dispatch] = useReducer(loadStateReducer, {
    loading: false,
    data: null,
    error: null,
  });

  useEffect(() => {
    dispatch({ kind: "start" });
    const controller = pdxAbortController();
    loadVic3Save(save, controller.signal)
      .then(async (data) => {
        dispatch({
          kind: "data",
          data: await createVic3Store({
            save: { meta: data, filename: save.file.name },
          }),
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        dispatch({ kind: "error", error });
        captureException(error);
      });
    return () => {
      controller.abort("cancelling save load");
    };
  }, [save]);

  return { loading, data, error };
}
