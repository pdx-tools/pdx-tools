import Head from "next/head";
import { getHoi4Worker } from "./worker";
import { MeltButton } from "@/components/MeltButton";
import { Alert } from "@/components/Alert";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { CountryDetails } from "./CountryDetails";
import { Hoi4StoreProvider, hoi4, useLoadHoi4 } from "./store";

export const Hoi4Page = () => {
  const meta = hoi4.useMeta();
  const saveFile = hoi4.useSaveInput();
  return (
    <main className="mx-auto mt-4 max-w-screen-lg">
      <Head>
        <title>{`${saveFile.name.replace(".hoi4", "")} - Hoi4 (${
          meta.date
        }) - PDX Tools`}</title>
      </Head>
      <div className="mx-auto flex max-w-prose flex-col gap-4">
        <h2 className="text-2xl font-bold">Hoi4</h2>
        <p>
          {`An Hoi4 save was detected (date ${meta.date}). At this time, Hoi4 functionality is limited but one can still melt binary saves into plaintext`}
        </p>
        {meta.isMeltable && (
          <MeltButton
            game="hoi4"
            worker={getHoi4Worker()}
            filename={saveFile.name}
          />
        )}

        <CountryDetails />
      </div>
    </main>
  );
};

type Hoi4SaveFile = { save: { file: File } };
export const Hoi4Ui = (props: Hoi4SaveFile) => {
  const { data, error } = useLoadHoi4(props.save.file);

  return (
    <>
      {error && (
        <Alert variant="error" className="px-4 py-2">
          <Alert.Description>{getErrorMessage(error)}</Alert.Description>
        </Alert>
      )}
      {data && (
        <Hoi4StoreProvider store={data}>
          <Hoi4Page />
        </Hoi4StoreProvider>
      )}
    </>
  );
};

export default Hoi4Ui;
