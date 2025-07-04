import { mapModes } from "../../types/map";
import { useEu4Actions, useEu4MapMode } from "../../store";
import { MapModeImage } from "./MapModeImage";
import { Tooltip } from "@/components/Tooltip";

export const MapModeButtonGroup = () => {
  const mapMode = useEu4MapMode();
  const { setMapMode: updateMapMode } = useEu4Actions();

  return (
    <>
      {mapModes.map((mode) => (
        <Tooltip key={mode}>
          <Tooltip.Trigger asChild>
            <button
              className="m-0 hidden select-none border-none bg-transparent p-0 group-hover:block"
              onClick={() => updateMapMode(mode)}
            >
              <MapModeImage
                mode={mode}
                className={mapMode == mode ? "brightness-200" : undefined}
              />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content>{mode}</Tooltip.Content>
        </Tooltip>
      ))}
    </>
  );
};
