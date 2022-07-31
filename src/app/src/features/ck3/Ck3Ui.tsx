import Head from "next/head";
import { useSelector } from "react-redux";
import { selectAnalyzeFileName } from "@/features/engine";
import { useCk3Meta } from "./ck3Slice";
import { MeltButton } from "./MeltButton";

export const Ck3Ui = () => {
  const filename = useSelector(selectAnalyzeFileName);
  const meta = useCk3Meta();
  return (
    <main className="max-w-screen-lg mx-auto mt-4">
      <Head>
        <title>{`${filename.replace(".ck3", "")} - CK3 (${
          meta.version
        }) - PDX Tools`}</title>
      </Head>
      <div className="max-w-prose mx-auto">
        <h2>CK3</h2>
        <p>
          {`A CK3 save was detected (version ${meta.version}). At this time, CK3 functionality is limited but one can still melt binary ironman saves into plaintext`}
        </p>
        {meta.isMeltable && <MeltButton />}
      </div>
    </main>
  );
};

export default Ck3Ui;
