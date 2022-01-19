import React from "react";
import { HtmlHead } from "@/components/head";
import { AppStructure } from "@/components/layout";
import { ChangeLog } from "@/features/changelog";

export const AppChangelog: React.FC<{}> = () => {
  return (
    <>
      <HtmlHead>
        <title>Changelog - PDX Tools</title>
        <meta
          name="description"
          content="A changelog of bugs and features added to PDX Tools"
        ></meta>
      </HtmlHead>
      <AppStructure>
        <ChangeLog />
      </AppStructure>
    </>
  );
};

export default AppChangelog;
