import React, { useEffect } from "react";
import { useFilePublisher } from "@/features/engine";
import { GameView } from "../engine/GameView";

type SaveProps = {
  saveId: string;
};

export const SavePage = ({ saveId }: SaveProps) => {
  const filePublisher = useFilePublisher();

  useEffect(() => {
    filePublisher({ kind: "server", saveId });
  }, [filePublisher, saveId]);

  return <GameView />;
};
