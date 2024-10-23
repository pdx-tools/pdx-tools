import { createFileRoute } from "@tanstack/react-router";
import { Root } from "@/components/layout";
import { Home } from "@/components/landing/Home";
import { GameView } from "@/features/engine/GameView";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Home2,
});

function Home2() {
  return (
    <Root>
      <GameView>
        <Home />
      </GameView>
    </Root>
  );
}
