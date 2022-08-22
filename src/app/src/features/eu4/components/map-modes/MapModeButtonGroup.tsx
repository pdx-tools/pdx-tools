import { Tooltip } from "antd";
import { useAppDispatch, useAppSelector } from "@/lib/store";
import political from "./images/mapmode_political.png";
import religion from "./images/mapmode_religion.png";
import development from "./images/mapmode_development.png";
import technology from "./images/mapmode_tech.png";
import terrain from "./images/mapmode_terrain.png";
import { setEu4MapMode } from "@/features/eu4/eu4Slice";
import { MapControls } from "../../types/map";

export const MapModeButtonGroup = () => {
  const selectedMode = useAppSelector((state) => state.eu4.mapControls.mode);

  const dispatch = useAppDispatch();
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
            onClick={() => dispatch(setEu4MapMode(key as MapControls["mode"]))}
          >
            <img
              alt={`${key} mapmode`}
              src={value}
              width={41}
              height={31}
              className={selectedMode == key ? "brightness-200" : undefined}
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
