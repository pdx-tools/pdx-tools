import Head from "next/head";
import { useSelector } from "react-redux";
import { selectAnalyzeFileName } from "@/features/engine";
import { useHoi4Meta } from "./hoi4Slice";
import { MeltButton } from "./MeltButton";

export const Hoi4Ui = () => {
  const filename = useSelector(selectAnalyzeFileName);
  const meta = useHoi4Meta();
  return (
    <main>
      <Head>
        <title>{`${filename.replace(".hoi4", "")} - HOI4 (${
          meta.date
        }) - PDX Tools`}</title>
      </Head>
      <h2>HOI4</h2>
      <p>
        {`A HOI4 save was detected (date ${meta.date}). At this time, HOI4 functionality is limited but one can still melt binary ironman saves into plaintext`}
      </p>
      {meta.isMeltable && <MeltButton />}

      <style jsx>{`
        main {
          max-width: 600px;
          margin-inline: auto;
          margin-block-start: 2rem;
        }
      `}</style>
    </main>
  );
};

export default Hoi4Ui;
