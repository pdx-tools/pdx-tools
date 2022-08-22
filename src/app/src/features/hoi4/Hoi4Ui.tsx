import Head from "next/head";
import { useSelector } from "react-redux";
import { selectAnalyzeFileName } from "@/features/engine";
import { useHoi4Meta } from "./hoi4Slice";
import { MeltButton } from "./MeltButton";

export const Hoi4Ui = () => {
  const filename = useSelector(selectAnalyzeFileName);
  const meta = useHoi4Meta();
  return (
    <main className="mx-auto mt-4 max-w-screen-lg">
      <Head>
        <title>{`${filename.replace(".hoi4", "")} - HOI4 (${
          meta.date
        }) - PDX Tools`}</title>
      </Head>
      <div className="mx-auto max-w-prose">
        <h2>HOI4</h2>
        <p>
          {`A HOI4 save was detected (date ${meta.date}). At this time, HOI4 functionality is limited but one can still melt binary ironman saves into plaintext`}
        </p>
        {meta.isMeltable && <MeltButton />}
      </div>
    </main>
  );
};

export default Hoi4Ui;
