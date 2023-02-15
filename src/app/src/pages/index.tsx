import React from "react";
import { HtmlHead } from "@/components/head";
import { Root } from "@/components/layout";
import { GameView } from "@/features/engine/GameView";
import { Home } from "@/components/landing/Home";

export const IndexPage = () => {
  return (
    <Root>
      <HtmlHead>
        <title>PDX Tools - Modern EU4 Save Analyzer</title>
        <meta
          name="description"
          content="View maps, graphs, and tables of your save and compete in a casual, evergreen leaderboard of EU4 achievement speed runs. Upload and share your save with the world."
        ></meta>

        <meta
          property="og:title"
          content="PDX Tools - Modern EU4 Save Analyzer"
        ></meta>
        <meta
          property="og:description"
          content="View maps, graphs, and tables of your save and compete in a casual, evergreen leaderboard of EU4 achievement speed runs. Upload and share your save with the world."
        ></meta>
      </HtmlHead>
      <GameView>
        <Home />
      </GameView>
    </Root>
  );
};

export default IndexPage;
