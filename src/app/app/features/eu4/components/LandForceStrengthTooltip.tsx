import { Tooltip } from "@/components/Tooltip";
import { CountryArmedForces } from "../../../../../wasm-eu4/pkg/wasm_eu4";
import { formatInt } from "@/lib/format";

export const LandForceStrengthTooltip = ({
  force,
}: {
  force: CountryArmedForces;
}) => {
  return (
    <Tooltip>
      <Tooltip.Trigger>
        {formatInt(
          force.infantryUnits.strength +
            force.cavalryUnits.strength +
            force.artilleryUnits.strength +
            force.mercenaryUnits.strength,
        )}
        K
      </Tooltip.Trigger>
      <Tooltip.Content className="flex flex-col p-2">
        <p>Infantry: {formatInt(force.infantryUnits.strength)}K</p>
        <p>Cavalry: {formatInt(force.cavalryUnits.strength)}K</p>
        <p>Artillery: {formatInt(force.artilleryUnits.strength)}K</p>
        <p>Mercenaries: {formatInt(force.mercenaryUnits.strength)}K</p>
      </Tooltip.Content>
    </Tooltip>
  );
};
