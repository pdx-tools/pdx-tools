import React, { useEffect } from "react";
import { HtmlHead } from "@/components/head";
import { Root } from "@/components/layout";
import { GameView } from "@/features/engine/GameView";
import { Home } from "@/components/landing/Home";

export const LoadingPage = () => {
  useEffect(() => {
    history.replaceState({}, "", "/");
  }, []);

  return (
    <Root>
      <HtmlHead>
        <title>PDX Tools</title>
        <meta
          name="description"
          content="PDX Tools is a home for EU4 save files to share with the world, compete in a casual leaderboard for achievement completion times, and to analyze with charts, tables, and maps"
        ></meta>
      </HtmlHead>
      <GameView>
        <Home />
      </GameView>
    </Root>
  );
};

export default LoadingPage;
