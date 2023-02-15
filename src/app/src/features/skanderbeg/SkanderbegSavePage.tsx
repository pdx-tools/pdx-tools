import React, { useEffect } from "react";
import { useFilePublisher } from "@/features/engine";
import { BrowserCheck } from "@/components/landing/BrowserCheck";
import { GameView } from "../engine/GameView";

type SkanRoute = {
  skanId: string;
};

export const SkanderbegSavePage = ({ skanId }: SkanRoute) => {
  const filePublisher = useFilePublisher();

  useEffect(() => {
    filePublisher({ kind: "skanderbeg", skanId });
  }, [filePublisher, skanId]);

  return (
    <>
      <BrowserCheck />
      <GameView />
    </>
  );
};
