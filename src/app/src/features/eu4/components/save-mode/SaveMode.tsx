import React from "react";
import { TeamOutlined, UserOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import Image from "next/image";
import { SaveMode as Mode } from "../../types/models";
import ironmanNo from "./ironman-no.png";
import ironmanOk from "./ironman-ok.png";

export interface SaveModeProps {
  mode: Mode;
}

export const SaveMode = ({ mode }: SaveModeProps) => {
  switch (mode) {
    case "Normal": {
      return (
        <Tooltip title="Normal mode">
          <UserOutlined />
        </Tooltip>
      );
    }
    case "Multiplayer": {
      return (
        <Tooltip title="Multiplayer">
          <TeamOutlined />
        </Tooltip>
      );
    }
    case "IronmanNo": {
      return (
        <Tooltip title="Ironman, achievement disabled">
          <Image
            alt="ironman but not achievement compatible"
            src={ironmanNo}
            width="30"
            height="36"
          />
        </Tooltip>
      );
    }
    case "IronmanOk": {
      return (
        <Tooltip title="Ironman, achievements enabled">
          <Image
            alt="achievement compatible ironman"
            src={ironmanOk}
            width="30"
            height="36"
          />
        </Tooltip>
      );
    }
  }
};
