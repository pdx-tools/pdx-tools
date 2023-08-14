import React, { useMemo } from "react";
import Eu4Ui from "../eu4/Eu4Ui";

type SkanRoute = {
  skanId: string;
};

export const SkanderbegSavePage = ({ skanId }: SkanRoute) => {
  const save = useMemo(
    () => ({ kind: "skanderbeg", skanId }) as const,
    [skanId],
  );
  return <Eu4Ui save={save} />;
};
