import { Tooltip } from "@/components/Tooltip";
import { formatInt } from "@/lib/format";
import { CountryArmedForces } from "../../../../../wasm-eu4/pkg/wasm_eu4";

export const NavalForceStrengthTooltip = ({
  forces,
}: {
  forces: CountryArmedForces;
}) => {
  return (
    <Tooltip>
      <Tooltip.Trigger>
        {formatInt(
          forces.heavyShipUnits +
            forces.lightShipUnits +
            forces.galleyUnits +
            forces.transportUnits,
        )}
      </Tooltip.Trigger>
      <Tooltip.Content className="flex flex-col p-2">
        <p>Heavy: {formatInt(forces.heavyShipUnits)}</p>
        <p>Light: {formatInt(forces.lightShipUnits)}</p>
        <p>Galley: {formatInt(forces.galleyUnits)}</p>
        <p>Transports: {formatInt(forces.transportUnits)}</p>
      </Tooltip.Content>
    </Tooltip>
  );
};
