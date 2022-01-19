import React, { useEffect } from "react";
import { selectEngineError, useFilePublisher } from "@/features/engine";
import { useSelector } from "react-redux";
import { Alert } from "antd";
import { AppHeader } from "@/components/layout/AppHeader";

interface SaveProps {
  saveId: string;
}

export const SavePage: React.FC<SaveProps> = ({ saveId }) => {
  const filePublisher = useFilePublisher();
  const engineError = useSelector(selectEngineError);

  useEffect(() => {
    filePublisher({ kind: "server", saveId });
  }, [filePublisher, saveId]);

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
