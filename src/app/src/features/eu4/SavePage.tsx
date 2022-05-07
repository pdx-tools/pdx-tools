import React, { useEffect } from "react";
import { selectEngineError, useFilePublisher } from "@/features/engine";
import { useSelector } from "react-redux";
import { Alert } from "antd";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppLoading } from "@/components/AppLoading";
import { BrowserCheck } from "@/components/landing/BrowserCheck";

interface SaveProps {
  saveId: string;
}

export const SavePage = ({ saveId }: SaveProps) => {
  const filePublisher = useFilePublisher();
  const engineError = useSelector(selectEngineError);

  useEffect(() => {
    filePublisher({ kind: "server", saveId });
  }, [filePublisher, saveId]);

  return (
    <>
      <BrowserCheck />
      {engineError && (
        <>
          <AppHeader />
          <Alert type="error" closable={true} message={engineError} />
        </>
      )}
      {!engineError && <AppLoading />}
    </>
  );
};
