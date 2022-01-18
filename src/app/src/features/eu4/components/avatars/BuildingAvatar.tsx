import React from "react";
import { Avatar, Space, Tooltip } from "antd";
import { GfxObj } from "@/features/eu4/types/models";

type BuildingProps = GfxObj & {
  condensed?: boolean;
};

export const BuildingAvatar: React.FC<BuildingProps> = ({
  id,
  name,
  gfx,
  condensed,
}) => {
  let buildingImage;
  try {
    buildingImage = require(`@/images/eu4/buildings/${id}_${gfx}.png`);
  } catch {
    try {
      buildingImage = require(`@/images/eu4/buildings/${id}.png`);
    } catch {}
  }

  if (buildingImage) {
    if (condensed) {
      return (
        <Tooltip title={`${name}`}>
          <Space>
            <Avatar shape="square" size={48} src={buildingImage} />
          </Space>
        </Tooltip>
      );
    } else {
      return (
        <Tooltip title={`${id}`}>
          <Space>
            <Avatar shape="square" size={48} src={buildingImage} />
            <span>{name}</span>
          </Space>
        </Tooltip>
      );
    }
  } else {
    return <div>{id}</div>;
  }
};
