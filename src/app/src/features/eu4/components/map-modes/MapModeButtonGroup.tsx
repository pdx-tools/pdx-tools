import { Tooltip } from "antd";
import { mapModes } from "../../types/map";
import { useEu4Actions, useEu4MapMode } from "../../store";
import { MapModeImage } from "./MapModeImage";

export const MapModeButtonGroup = () => {
  const mapMode = useEu4MapMode();
  const { setMapMode: updateMapMode } = useEu4Actions();

  return (
    <>
      {mapModes.map((mode) => (
        <Tooltip key={mode} mouseEnterDelay={1} title={mode}>
          <button
            className="m-0 hidden select-none border-none bg-transparent p-0 group-hover:block"
            onClick={() => updateMapMode(mode)}
          >
            <MapModeImage
              mode={mode}
              className={mapMode == mode ? "brightness-200" : undefined}
            />
          </button>
        </Tooltip>
      ))}
    </>
  );
};
