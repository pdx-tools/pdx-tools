import { useReducer, useEffect } from "react";
import { logMs } from "@/lib/log";
import { timeit } from "@/lib/timeit";
import Head from "next/head";
import { getImperatorWorker } from "./worker";
import { MeltButton } from "@/components/MeltButton";
import { ImperatorMetadata } from "./worker/types";
import { emitEvent } from "@/lib/events";
import { Alert } from "@/components/Alert";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { pdxAbortController } from "@/lib/abortController";
import { captureException } from "@/lib/captureException";

export type ImperatorSaveFile = { save: { file: File } };
type ImperatorPageProps = ImperatorSaveFile & { meta: ImperatorMetadata };
export const ImperatorPage = ({ save, meta }: ImperatorPageProps) => {
  return (
    <main className="mx-auto mt-4 max-w-screen-lg">
      <Head>
        <title>{`${save.file.name.replace(".rome", "")} - Imperator (${
          meta.date
        }) - PDX Tools`}</title>
      </Head>
      <div className="mx-auto flex max-w-prose flex-col gap-4">
        <h2 className="text-2xl font-bold">Imperator</h2>
        <p>
          {`An Imperator save was detected (date ${meta.date}). At this time, Imperator functionality is limited but one can still melt binary saves into plaintext`}
        </p>
        {meta.isMeltable && (
          <MeltButton
            game="imperator"
            worker={getImperatorWorker()}
            filename={save.file.name}
          />
        )}
      </div>
    </main>
  );
};

type Task<T> = {
  fn: () => T | Promise<T>;
  name: string;
};

async function loadImperatorSave(file: File, signal: AbortSignal) {
  const run = async <T,>({ fn, name }: Task<T>) => {
    signal.throwIfAborted();
    const result = await timeit(fn).then((res) => {
      logMs(res, name);
      return res.data;
    });
    signal.throwIfAborted();
    return result;
  };

  const worker = getImperatorWorker();
  await Promise.all([
    run({
      fn: () => worker.initializeWasm(),
      name: "initialized Imperator wasm",
    }),

    run({
      fn: () => worker.fetchData(file),
      name: "save data read",
    }),
  ]);

  const { meta } = await run({
    fn: () => worker.parseImperator(),
    name: "parse Imperator file",
  });

  emitEvent({ kind: "Save parsed", game: "imperator", source: "local" });

  return { meta };
}

type ImperatorLoadState = {
  loading: boolean;
  data: ImperatorMetadata | null;
  error: unknown | null;
};

type ImperatorLoadActions =
  | { kind: "start" }
  | { kind: "data"; data: ImperatorMetadata }
  | { kind: "error"; error: unknown };

const loadStateReducer = (
  state: ImperatorLoadState,
  action: ImperatorLoadActions,
): ImperatorLoadState => {
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

function useLoadImperator(input: ImperatorSaveFile) {
  const [{ loading, data, error }, dispatch] = useReducer(loadStateReducer, {
    loading: false,
    data: null,
    error: null,
  });

  useEffect(() => {
    dispatch({ kind: "start" });
    const controller = pdxAbortController();
    loadImperatorSave(input.save.file, controller.signal)
      .then(({ meta }) => {
        dispatch({ kind: "data", data: meta });
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

export const ImperatorUi = (props: ImperatorSaveFile) => {
  const { data, error } = useLoadImperator(props);

  return (
    <>
      {error && (
        <Alert variant="error" className="px-4 py-2">
          <Alert.Description>{getErrorMessage(error)}</Alert.Description>
        </Alert>
      )}
      {data && <ImperatorPage {...props} meta={data} />}
    </>
  );
};

export default ImperatorUi;
