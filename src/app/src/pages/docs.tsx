import React from "react";
import { ApiDocs } from "@/features/docs";
import { HtmlHead } from "@/components/head";
import { AppStructure } from "@/components/layout";

export const ApiDocsPage: React.FC<{}> = () => {
  return (
    <>
      <HtmlHead>
        <title>API Docs - PDX Tools</title>
        <meta name="description" content="PDX Tools API Docs"></meta>
      </HtmlHead>
      <AppStructure>
        <ApiDocs />
      </AppStructure>
    </>
  );
};

export default ApiDocsPage;
