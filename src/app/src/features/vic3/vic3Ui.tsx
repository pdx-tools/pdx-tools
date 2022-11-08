import Head from "next/head";
import { useSelector } from "react-redux";
import { selectAnalyzeFileName } from "@/features/engine";
import { useVic3Meta } from "./vic3Slice";
import { MeltButton } from "./MeltButton";

export const Vic3Ui = () => {
  const filename = useSelector(selectAnalyzeFileName);
  const meta = useVic3Meta();
  return (
    <main className="mx-auto mt-4 max-w-screen-lg">
      <Head>
        <title>{`${filename.replace(".rome", "")} - Vic3 (${
          meta.date
        }) - PDX Tools`}</title>
      </Head>
      <div className="mx-auto max-w-prose">
        <h2>Vic3</h2>
        <p>
          {`A Vic3 save was detected (date ${meta.date}). At this time, Vic3 functionality is limited but one can still melt binary saves into plaintext`}
        </p>
        {meta.isMeltable && <MeltButton />}
      </div>
    </main>
  );
};

export default Vic3Ui;
