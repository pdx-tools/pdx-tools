import { GameView } from "@/features/engine/GameView";
import { Home } from "@/components/landing/Home";
import { Root } from "@/components/layout";
import { useEffect } from "react";
import { isSaveLoaded, useEngineActions } from "@/features/engine/engineStore";
import { useHistory } from "@/features/eu5/history/store";

export default function Index() {
  const { fileInput } = useEngineActions();
  useEffect(() => {
    // GameView clears its input on unmount (including React dev-mode replay).
    // Resume a selected snapshot after the viewer has finished mounting.
    const timer = setTimeout(() => {
      const { selectedHash, files } = useHistory.getState();
      const file = selectedHash && files[selectedHash];
      if (file && !isSaveLoaded()) fileInput({ kind: "eu5", data: { kind: "file", file } });
    }, 0);
    return () => clearTimeout(timer);
  }, [fileInput]);
  return (
    <Root>
      <GameView>
        <Home />
      </GameView>
    </Root>
  );
}
