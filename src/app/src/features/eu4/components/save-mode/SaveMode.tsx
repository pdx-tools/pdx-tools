import React from "react";
import { TeamOutlined, UserOutlined } from "@ant-design/icons";
import Image from "next/image";
import { SaveMode as Mode } from "../../types/models";
import ironmanNo from "./ironman-no.png";
import ironmanOk from "./ironman-ok.png";
import { Tooltip } from "@/components/Tooltip";

export interface SaveModeProps {
  mode: Mode;
}

export const SaveMode = ({ mode }: SaveModeProps) => {
  switch (mode) {
    case "Normal": {
      return (
        <Tooltip>
          <Tooltip.Trigger>
            <UserOutlined />
          </Tooltip.Trigger>
          <Tooltip.Content>Normal mode</Tooltip.Content>
        </Tooltip>
      );
    }
    case "Multiplayer": {
      return (
        <Tooltip>
          <Tooltip.Trigger>
            <TeamOutlined />
          </Tooltip.Trigger>
          <Tooltip.Content>Multiplayer</Tooltip.Content>
        </Tooltip>
      );
    }
    case "IronmanNo": {
      return (
        <Tooltip>
          <Tooltip.Trigger>
            <Image
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
            <Image
              alt="Ironman, achievements enabled"
              src={ironmanOk}
              width="30"
              height="36"
            />
          </Tooltip.Trigger>
          <Tooltip.Content>Ironman, achievements enabled</Tooltip.Content>
        </Tooltip>
      );
    }
  }
};
