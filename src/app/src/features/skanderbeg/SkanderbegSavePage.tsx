import React, { useEffect } from "react";
import { selectEngineError, useFilePublisher } from "@/features/engine";
import { useSelector } from "react-redux";
import { Alert } from "antd";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppLoading } from "@/components/AppLoading";
import { BrowserCheck } from "@/components/landing/BrowserCheck";

interface SkanRoute {
  skanId: string;
}

export const SkanderbegSavePage = ({ skanId }: SkanRoute) => {
  const filePublisher = useFilePublisher();
  const engineError = useSelector(selectEngineError);

  useEffect(() => {
    filePublisher({ kind: "skanderbeg", skanId });
  }, [filePublisher, skanId]);

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
