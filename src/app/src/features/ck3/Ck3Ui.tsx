import Head from "next/head";
import { useSelector } from "react-redux";
import { selectAnalyzeFileName } from "@/features/engine";
import { useCk3Meta } from "./ck3Slice";
import { MeltButton } from "./MeltButton";

export const Ck3Ui: React.FC<{}> = () => {
  const filename = useSelector(selectAnalyzeFileName);
  const meta = useCk3Meta();
  return (
    <main>
      <Head>
        <title>{`${filename.replace(".ck3", "")} - CK3 (${
          meta.version
        }) - Rakaly`}</title>
      </Head>
      <h2>CK3</h2>
      <p>
        {`A CK3 save was detected (version ${meta.version}). At this time, CK3 functionality is limited but one can still melt binary ironman saves into plaintext`}
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

export default Ck3Ui;
