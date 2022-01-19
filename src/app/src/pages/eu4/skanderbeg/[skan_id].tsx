import React from "react";
import { useRouter } from "next/router";
import { SkanderbegSavePage } from "@/features/skanderbeg";
import { HtmlHead } from "@/components/head";
import { AppStructure } from "@/components/layout";
import { FileDropInitial } from "@/features/engine/FileDrop";
import { CanvasContextProvider } from "@/features/engine/persistant-canvas-context";

export const SkanderbegSave: React.FC<{}> = () => {
  const router = useRouter();
  const { skan_id } = router.query;
  return (
    <>
      <HtmlHead>
        <title>{`PDX Tools | Skanderbeg Save`}</title>
        <meta
          name="description"
          content="Analyze EU4 save file that have been uploaded to Skanderbeg"
        ></meta>
      </HtmlHead>
      <AppStructure header={false}>
        {typeof skan_id === "string" && !Array.isArray(skan_id) ? (
          <CanvasContextProvider>
            <SkanderbegSavePage skanId={skan_id} />
            <FileDropInitial />
          </CanvasContextProvider>
        ) : null}
      </AppStructure>
    </>
  );
};

export default SkanderbegSave;
