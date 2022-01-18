import React from "react";
import { ApiDocs } from "@/features/docs";
import { HtmlHead } from "@/components/head";
import { RakalyStructure } from "@/components/layout";

export const ApiDocsPage: React.FC<{}> = () => {
  return (
    <>
      <HtmlHead>
        <title>API Docs - Rakaly</title>
        <meta name="description" content="Rakaly API Docs"></meta>
      </HtmlHead>
      <RakalyStructure>
        <ApiDocs />
      </RakalyStructure>
    </>
  );
};

export default ApiDocsPage;
