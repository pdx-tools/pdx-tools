import React from "react";
import { MapModeButtonGroup } from "./MapModeButtonGroup";
import { useSelector } from "react-redux";
import { selectModuleDrawn } from "@/features/engine";

export const MapModeSideBar: React.FC<{}> = () => {
  const hasDrawn = useSelector(selectModuleDrawn);
  return (
    <div className="map-mode-sidebar touch-none">
      <div className="map-mode-container">
        <MapModeButtonGroup />
      </div>
      <style jsx>{`
        .map-mode-sidebar {
          position: fixed;
          bottom: 0;
          right: 0;
          display: flex;
          user-select: none;
        }

        .map-mode-container {
          display: ${hasDrawn ? "flex" : "none"};
        }
      `}</style>
    </div>
  );
};
