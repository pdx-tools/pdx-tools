import React from "react";
import { useSelector } from "react-redux";
import { AnalyzeProgress } from "./components/AnalyzeProgress";
import { useWindowMessageDrop } from "./hooks/useWindowMessageDrop";
import { useDocumentFileDrop } from "./hooks/useDocumentFileDrop";
import {
  selectAnalyzeOriginalBackdropVisible,
  selectAnalyzeProgressVisible,
} from "./engineSlice";
import { CanvasContextProvider } from "./persistant-canvas-context";
import { GameView } from "./GameView";

interface FileDropInitialProps {
  children?: React.ReactNode;
}

export const FileDropInitial = ({ children }: FileDropInitialProps) => {
  const showProgress = useSelector(selectAnalyzeProgressVisible);
  const showBackdrop = useSelector(selectAnalyzeOriginalBackdropVisible);

  return (
    <>
      <div style={{ position: "relative" }}>
        {showBackdrop && children}
        {showProgress && <AnalyzeProgress />}
      </div>
      <GameView />
    </>
  );
};

const ListenOnFileDrops = ({ children }: FileDropInitialProps) => {
  useDocumentFileDrop();
  useWindowMessageDrop();
  return <>{children}</>;
};

export const FileDrop = ({ children }: FileDropInitialProps) => {
  return (
    <CanvasContextProvider>
      <ListenOnFileDrops>
        <FileDropInitial>{children}</FileDropInitial>
      </ListenOnFileDrops>
    </CanvasContextProvider>
  );
};
