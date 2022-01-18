import React from "react";
import { HtmlHead } from "@/components/head";
import { RakalyStructure } from "@/components/layout";
import { ChangeLog } from "@/features/changelog";

export const RakalyChangelog: React.FC<{}> = () => {
  return (
    <>
      <HtmlHead>
        <title>Changelog - Rakaly</title>
        <meta
          name="description"
          content="A changelog of bugs and features added to Rakaly"
        ></meta>
      </HtmlHead>
      <RakalyStructure>
        <ChangeLog />
      </RakalyStructure>
    </>
  );
};

export default RakalyChangelog;
