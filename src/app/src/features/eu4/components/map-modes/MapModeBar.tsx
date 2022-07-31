import React from "react";
import { MapModeButtonGroup } from "./MapModeButtonGroup";
import { useSelector } from "react-redux";
import { selectModuleDrawn } from "@/features/engine";

export const MapModeSideBar = () => {
  const hasDrawn = useSelector(selectModuleDrawn);
  return (
    <div className="fixed bottom-0 right-0 flex select-none touch-none">
      <div style={{ display: hasDrawn ? "flex" : "none" }}>
        <MapModeButtonGroup />
      </div>
    </div>
  );
};
