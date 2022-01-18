import React from "react";
import { HtmlHead } from "@/components/head";
import { RakalyStructure } from "@/components/layout";
import { SkanderbegPage } from "@/features/skanderbeg";

export const Eu4Skanderbeg: React.FC<{}> = () => {
  return (
    <>
      <HtmlHead>
        <title>Analyze Skanderbeg saves - Rakaly</title>
        <meta
          name="description"
          content="Analyze EU4 save files that have been uploaded to Skanderbeg"
        ></meta>
      </HtmlHead>
      <RakalyStructure>
        <SkanderbegPage />
      </RakalyStructure>
    </>
  );
};

export default Eu4Skanderbeg;
