import React, { useMemo } from "react";
import Eu4Ui from "./Eu4Ui";

type SaveProps = {
  saveId: string;
};

export const SavePage = ({ saveId }: SaveProps) => {
  const save = useMemo(() => ({ kind: "server", saveId }) as const, [saveId]);
  return <Eu4Ui save={save} />;
};
