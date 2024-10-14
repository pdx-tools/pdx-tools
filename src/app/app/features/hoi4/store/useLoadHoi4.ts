import { Hoi4Store, createHoi4Store } from "./hoi4Store";
import { useEffect, useReducer } from "react";
import { pdxAbortController } from "@/lib/abortController";
import { timeit } from "@/lib/timeit";
import { logMs } from "@/lib/log";
import { getHoi4Worker } from "../worker";
import { emitEvent } from "@/lib/events";
import { captureException } from "@/lib/captureException";

type Task<T> = {
  fn: () => T | Promise<T>;
  name: string;
};

type Hoi4LoadState = {
  loading: boolean;
  data: Hoi4Store | null;
  error: unknown | null;
};

type Hoi4LoadActions =
  | { kind: "start" }
  | { kind: "data"; data: Hoi4Store }
  | { kind: "error"; error: unknown };

const loadStateReducer = (
  state: Hoi4LoadState,
  action: Hoi4LoadActions,
): Hoi4LoadState => {
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

export function useLoadHoi4(input: File) {
  const [{ loading, data, error }, dispatch] = useReducer(loadStateReducer, {
    loading: false,
    data: null,
    error: null,
  });

  useEffect(() => {
    dispatch({ kind: "start" });
    const controller = pdxAbortController();
    loadHoi4Save(input, controller.signal)
      .then(({ meta }) => {
        const store = createHoi4Store({
          input,
          meta,
        });
        dispatch({ kind: "data", data: store });
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
  }, [input]);

  return { loading, data, error };
}

async function loadHoi4Save(file: File, signal: AbortSignal) {
  const run = async <T>({ fn, name }: Task<T>) => {
    signal.throwIfAborted();
    const result = await timeit(fn).then((res) => {
      logMs(res, name);
      return res.data;
    });
    signal.throwIfAborted();
    return result;
  };

  const worker = getHoi4Worker();
  await Promise.all([
    run({
      fn: () => worker.initializeWasm(),
      name: "initialized Hoi4 wasm",
    }),

    run({
      fn: () => worker.fetchData(file),
      name: "save data read",
    }),
  ]);

  const { meta } = await run({
    fn: () => worker.parseHoi4(),
    name: "parse Hoi4 file",
  });

  emitEvent({ kind: "Save parsed", game: "hoi4", source: "local" });

  return { meta };
}
