import { useRouter } from "next/router";
import React from "react";
import { HtmlHead } from "@/components/head";
import { AppStructure } from "@/components/layout";
import { FileDropInitial } from "@/features/engine/FileDrop";
import { CanvasContextProvider } from "@/features/engine/persistant-canvas-context";
import { SavePage } from "@/features/eu4/SavePage";

export const Eu4Save: React.FC<{}> = () => {
  const router = useRouter();
  const { save_id } = router.query;

  if (typeof save_id != "string" || Array.isArray(save_id)) {
    return null;
  }

  return (
    <>
      <HtmlHead>
        <title>Loading Save: {save_id} - EU4 - PDX Tools</title>
      </HtmlHead>
      <AppStructure header={false}>
        <CanvasContextProvider>
          <FileDropInitial />
          <SavePage saveId={save_id} />
        </CanvasContextProvider>
      </AppStructure>
    </>
  );
};

export default Eu4Save;
