import Head from "next/head";
import { useSelector } from "react-redux";
import { selectAnalyzeFileName } from "@/features/engine";
import { useImperatorMeta } from "./imperatorSlice";
import { MeltButton } from "./MeltButton";

export const ImperatorUi = () => {
  const filename = useSelector(selectAnalyzeFileName);
  const meta = useImperatorMeta();
  return (
    <main>
      <Head>
        <title>{`${filename.replace(".rome", "")} - Imperator (${
          meta.date
        }) - PDX Tools`}</title>
      </Head>
      <h2>Imperator</h2>
      <p>
        {`An Imperator: Rome save was detected (version ${meta.version}). At this time, Imperator functionality is limited but one can still melt binary ironman saves into plaintext`}
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

export default ImperatorUi;
