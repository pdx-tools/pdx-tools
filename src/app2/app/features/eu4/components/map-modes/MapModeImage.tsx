import React from "react";
import political from "./images/mapmode_political.png";
import religion from "./images/mapmode_religion.png";
import development from "./images/mapmode_development.png";
import battles from "./images/mapmode_battles.png";
import technology from "./images/mapmode_tech.png";
import terrain from "./images/mapmode_terrain.png";
import { MapControls } from "../../types/map";

function modeLookup(mode: MapControls["mode"]) {
  switch (mode) {
    case "political":
      return political;
    case "religion":
      return religion;
    case "development":
      return development;
    case "battles":
      return battles;
    case "technology":
      return technology;
    case "terrain":
      return terrain;
  }
}

export const MapModeImage = ({
  mode,
  ...rest
}: {
  mode: MapControls["mode"];
} & Partial<React.ImgHTMLAttributes<HTMLImageElement>>) => (
  <img
    {...rest}
    alt={`${mode} mapmode`}
    src={modeLookup(mode)}
    width={41}
    height={31}
    draggable={false} /* don't want to accidentally trigger file drop */
  />
);
