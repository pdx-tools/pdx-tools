import React from "react";
import { Avatar, Tooltip } from "antd";
import { GfxObj } from "@/features/eu4/types/models";

type BuildingProps = GfxObj & {
  condensed?: boolean;
};

export const BuildingAvatar = ({ id, name, gfx, condensed }: BuildingProps) => {
  let src: string | undefined;
  try {
    src = require(`@/images/eu4/buildings/${id}_${gfx}.png`);
  } catch {
    try {
      src = require(`@/images/eu4/buildings/${id}.png`);
    } catch {
      return <div>{id}</div>;
    }
  }

  if (condensed) {
    return (
      <Tooltip title={`${name}`}>
        <Avatar shape="square" size={48} src={src} />
      </Tooltip>
    );
  } else {
    return (
      <Tooltip title={`${id}`}>
        <div className="flex items-center space-x-2">
          <Avatar shape="square" size={48} src={src} />
          <span>{name}</span>
        </div>
      </Tooltip>
    );
  }
};
