import React from "react";
import { Avatar, Tooltip } from "antd";
import { GfxObj } from "@/features/eu4/types/models";

type BuildingProps = GfxObj & {
  condensed?: boolean;
};

export const BuildingAvatar = ({ id, name, gfx, condensed }: BuildingProps) => {
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
          <Avatar shape="square" size={48} src={buildingImage} />
        </Tooltip>
      );
    } else {
      return (
        <Tooltip title={`${id}`}>
          <div className="flex items-center space-x-2">
            <Avatar shape="square" size={48} src={buildingImage} />
            <span>{name}</span>
          </div>
        </Tooltip>
      );
    }
  } else {
    return <div>{id}</div>;
  }
};
