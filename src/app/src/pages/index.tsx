import React from "react";
import { HtmlHead } from "@/components/head";
import { Home } from "@/components/landing/Home";
import { RakalyStructure } from "@/components/layout";
import { FileDrop } from "@/features/engine/FileDrop";

export const IndexPage: React.FC<{}> = () => {
  return (
    <>
      <HtmlHead>
        <title>Rakaly</title>
        <meta
          name="description"
          content="Modern EU4 save file analyzer. View maps, graphs, and tables of your save and compete in a casual leaderboard of EU4 achievement speed runs. Upload and share your save with the world."
        ></meta>
      </HtmlHead>
      <RakalyStructure>
        <FileDrop>
          <Home />
        </FileDrop>
      </RakalyStructure>
    </>
  );
};

export default IndexPage;
