import { Tooltip } from "antd";
import Image from "next/image";
import political from "./images/mapmode_political.png";
import religion from "./images/mapmode_religion.png";
import development from "./images/mapmode_development.png";
import technology from "./images/mapmode_tech.png";
import terrain from "./images/mapmode_terrain.png";
import { MapControls } from "../../types/map";
import { useEu4Actions, useEu4MapMode } from "../../Eu4SaveProvider";

export const MapModeButtonGroup = () => {
  const mapMode = useEu4MapMode();
  const { setMapMode: updateMapMode } = useEu4Actions();

  const modes: Record<MapControls["mode"], string> = {
    political,
    religion,
    development,
    technology,
    terrain,
  };

  return (
    <>
      {Object.entries(modes).map(([key, value]) => (
        <Tooltip key={key} mouseEnterDelay={1} title={key}>
          <button
            className="m-0 select-none border-none bg-transparent p-0"
            onClick={() => updateMapMode(key as MapControls["mode"])}
          >
            <Image
              alt={`${key} mapmode`}
              src={value}
              width={41}
              height={31}
              className={mapMode == key ? "brightness-200" : undefined}
              draggable={
                false
              } /* don't want to accidentally trigger file drop */
            />
          </button>
        </Tooltip>
      ))}
    </>
  );
};
