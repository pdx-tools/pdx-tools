import React from "react";
import { HtmlHead } from "@/components/head";
import { AppStructure } from "@/components/layout";
import { SkanderbegPage } from "@/features/skanderbeg";

export const Eu4Skanderbeg = () => {
  return (
    <>
      <HtmlHead>
        <title>Analyze Skanderbeg saves - PDX Tools</title>
        <meta
          name="description"
          content="Analyze EU4 save files that have been uploaded to Skanderbeg"
        ></meta>
      </HtmlHead>
      <AppStructure>
        <SkanderbegPage />
      </AppStructure>
    </>
  );
};

export default Eu4Skanderbeg;
