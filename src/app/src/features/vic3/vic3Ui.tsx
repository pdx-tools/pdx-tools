import { useReducer, useEffect } from "react";
import { logMs } from "@/lib/log";
import { timeit } from "@/lib/timeit";
import Head from "next/head";
import { getVic3Worker } from "./worker";
import { MeltButton } from "@/components/MeltButton";
import { Vic3Metadata } from "./worker/types";
import { captureException } from "../errors";
import { Alert, AlertDescription } from "@/components/Alert";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { emitEvent } from "@/lib/plausible";

export type Vic3SaveFile = { save: { file: File } };
type Vic3PageProps = Vic3SaveFile & { meta: Vic3Metadata };

export const Vic3Page = ({ save, meta }: Vic3PageProps) => {
  return (
    <main className="mx-auto mt-4 max-w-screen-lg">
      <Head>
        <title>{`${save.file.name.replace(".v3", "")} - Vic3 (${
          meta.date
        }) - PDX Tools`}</title>
      </Head>
      <div className="mx-auto max-w-prose">
        <h2>Vic3</h2>
        <p>
          {`A Vic3 save was detected (date ${meta.date}). At this time, Vic3 functionality is limited but one can still melt binary saves into plaintext`}
        </p>
        {meta.isMeltable && (
          <MeltButton
            game="vic3"
            worker={getVic3Worker()}
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

function runTask<T>({ fn, name }: Task<T>) {
  return timeit(fn).then((res) => {
    logMs(res, name);
    return res.data;
  });
}

async function loadVic3Save(file: File) {
  const worker = getVic3Worker();
  emitEvent({ kind: "parse", game: "vic3" });

  await Promise.all([
    runTask({
      fn: () => worker.initializeWasm(),
      name: "initialized vic3 wasm",
    }),

    runTask({
      fn: () => worker.fetchData(file),
      name: "save data read",
    }),
  ]);

  const { meta } = await runTask({
    fn: () => worker.parseVic3(),
    name: "parse vic3 file",
  });

  return { meta };
}

type Vic3LoadState = {
  loading: boolean;
  data: Vic3Metadata | null;
  error: unknown | null;
};

type Vic3LoadActions =
  | { kind: "start" }
  | { kind: "data"; data: Vic3Metadata }
  | { kind: "error"; error: unknown };

const loadStateReducer = (
  state: Vic3LoadState,
  action: Vic3LoadActions
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

function useLoadVic3(input: Vic3SaveFile) {
  const [{ loading, data, error }, dispatch] = useReducer(loadStateReducer, {
    loading: false,
    data: null,
    error: null,
  });

  useEffect(() => {
    dispatch({ kind: "start" });
    loadVic3Save(input.save.file)
      .then(({ meta }) => {
        dispatch({ kind: "data", data: meta });
      })
      .catch((error) => {
        dispatch({ kind: "error", error });
        captureException(error);
      });
  }, [input]);

  return { loading, data, error };
}

export const Vic3Ui = (props: Vic3SaveFile) => {
  const { data, error } = useLoadVic3(props);

  return (
    <>
      {error && (
        <Alert variant="error" className="px-4 py-2">
          <AlertDescription>{getErrorMessage(error)}</AlertDescription>
        </Alert>
      )}
      {data && <Vic3Page {...props} meta={data} />}
    </>
  );
};

export default Vic3Ui;
