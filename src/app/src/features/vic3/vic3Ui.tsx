import { useState, useCallback } from "react";
import Head from "next/head";
import { getVic3Worker } from "./worker";
import { CountryStatsTable } from "./CountryStats";
import { CountryGDPChart } from "./CountryChart";
import { TagSelect } from "./TagSelect";
import { MeltButton } from "@/components/MeltButton";
import { Alert } from "@/components/Alert";
import { VisualizationProvider } from "@/components/viz";
import {
  Vic3SaveInput,
  Vic3StoreProvider,
  useLoadVic3,
  useSaveFilename,
  useVic3Meta,
} from "./store";
import { useVic3Worker } from "./worker/useVic3Worker";

export const Vic3Page = () => {
  const meta = useVic3Meta();
  const filename = useSaveFilename();
  const [selectedTag, setSelectedTag] = useState(meta.lastPlayedTag);
  const { data: stats } = useVic3Worker(
    useCallback(
      (worker) => worker.get_country_stats(selectedTag),
      [selectedTag],
    ),
  );

  return (
    <main className="mx-auto mt-4">
      <Head>
        <title>{`${filename.replace(".v3", "")} - Vic3 (${
          meta.date
        }) - PDX Tools`}</title>
      </Head>
      <div className="flex flex-col gap-8 items-center">
        <div className="mx-auto max-w-prose flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Vic3</h2>
          <p>
            {`A Vic3 save was detected (date ${meta.date}). At this time, Vic3 functionality is limited but one can still melt binary saves into plaintext`}
          </p>
          {meta.isMeltable && (
            <MeltButton
              game="vic3"
              worker={getVic3Worker()}
              filename={filename}
            />
          )}
          <TagSelect value={selectedTag} onChange={setSelectedTag} />
        </div>
        <VisualizationProvider>
          <div className="max-w-screen-2xl w-full px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="p-2">
                <span> GDP/c </span>
                <CountryGDPChart type="gdpc" stats={stats?.data ?? []} />
              </div>
              <div className="p-2">
                <span> GDP (M) </span>
                <CountryGDPChart type="gdp" stats={stats?.data ?? []} />
              </div>
            </div>
          </div>
        </VisualizationProvider>
        <div className="max-w-screen-lg mx-auto">
          <CountryStatsTable stats={stats?.data ?? []} />
        </div>
      </div>
    </main>
  );
};

export const Vic3Ui = (props: { save: Vic3SaveInput }) => {
  const { data, error } = useLoadVic3(props.save);

  return (
    <>
      <Alert.Error className="px-4 py-2" msg={error} />
      {data && (
        <Vic3StoreProvider store={data}>
          <Vic3Page />
        </Vic3StoreProvider>
      )}
    </>
  );
};

export default Vic3Ui;
