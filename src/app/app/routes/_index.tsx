import { GameView } from "@/features/engine/GameView";
import { Home } from "@/components/landing/Home";
import { Root } from "@/components/layout";

export default function Index() {
  return (
    <Root>
      <GameView>
        <Home />
      </GameView>
    </Root>
  );
}
