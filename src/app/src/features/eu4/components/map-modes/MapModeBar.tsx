import React from "react";
import { MapModeButtonGroup } from "./MapModeButtonGroup";

export const MapModeSideBar = () => {
  return (
    <div className="fixed bottom-0 right-0 flex touch-none select-none">
      <div className="flex">
        <MapModeButtonGroup />
      </div>
    </div>
  );
};
