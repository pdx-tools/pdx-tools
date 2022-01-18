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

export const FileDropInitial: React.FC<{}> = ({ children }) => {
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

const ListenOnFileDrops: React.FC<{}> = ({ children }) => {
  useDocumentFileDrop();
  useWindowMessageDrop();
  return <>{children}</>;
};

export const FileDrop: React.FC<{}> = ({ children }) => {
  return (
    <CanvasContextProvider>
      <ListenOnFileDrops>
        <FileDropInitial>{children}</FileDropInitial>
      </ListenOnFileDrops>
    </CanvasContextProvider>
  );
};
