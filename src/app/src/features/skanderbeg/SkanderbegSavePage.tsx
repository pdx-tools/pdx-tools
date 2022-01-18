import React, { useEffect } from "react";
import { selectEngineError, useFilePublisher } from "@/features/engine";
import { useSelector } from "react-redux";
import { Alert } from "antd";
import { AppHeader } from "@/components/layout/AppHeader";

interface SkanRoute {
  skanId: string;
}

export const SkanderbegSavePage: React.FC<SkanRoute> = ({ skanId }) => {
  const filePublisher = useFilePublisher();
  const engineError = useSelector(selectEngineError);

  useEffect(() => {
    filePublisher({ kind: "skanderbeg", skanId });
  }, [filePublisher, skanId]);

  return (
    <>
      {engineError && (
        <>
          <AppHeader />
          <Alert type="error" closable={true} message={engineError} />
        </>
      )}
    </>
  );
};
