import type { SaveMode as Mode } from "../../types/models";
import ironmanNo from "./ironman-no.png";
import ironmanOk from "./ironman-ok.png";
import { Tooltip } from "@/components/Tooltip";
import UserIcon from "@heroicons/react/24/outline/UserIcon";
import UsersIcon from "@heroicons/react/24/outline/UsersIcon";

export interface SaveModeProps {
  mode: Mode;
}

export const SaveMode = ({ mode }: SaveModeProps) => {
  switch (mode) {
    case "Normal": {
      return (
        <Tooltip>
          <Tooltip.Trigger>
            <UserIcon className="h-6 w-6" />
          </Tooltip.Trigger>
          <Tooltip.Content>Normal mode</Tooltip.Content>
        </Tooltip>
      );
    }
    case "Multiplayer": {
      return (
        <Tooltip>
          <Tooltip.Trigger>
            <UsersIcon className="h-6 w-6" />
          </Tooltip.Trigger>
          <Tooltip.Content>Multiplayer</Tooltip.Content>
        </Tooltip>
      );
    }
    case "IronmanNo": {
      return (
        <Tooltip>
          <Tooltip.Trigger>
            <img
              alt="ironman but not achievement compatible"
              src={ironmanNo}
              width="30"
              height="36"
            />
          </Tooltip.Trigger>
          <Tooltip.Content>Ironman, achievement disabled</Tooltip.Content>
        </Tooltip>
      );
    }
    case "IronmanOk": {
      return (
        <Tooltip>
          <Tooltip.Trigger>
            <img alt="Ironman, achievements enabled" src={ironmanOk} width="30" height="36" />
          </Tooltip.Trigger>
          <Tooltip.Content>Ironman, achievements enabled</Tooltip.Content>
        </Tooltip>
      );
    }
  }
};
