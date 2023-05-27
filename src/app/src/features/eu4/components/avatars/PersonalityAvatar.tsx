import React from "react";
import { Avatar, Tooltip } from "antd";
import { LocalizedObj } from "@/features/eu4/types/models";

export const PersonalityAvatar = ({ id, name }: LocalizedObj) => {
  try {
    const imageSrc: string = require(`@/images/eu4/personalities/${id}.png`);
    return (
      <Tooltip title={`${name}`}>
        <div className="space-x-2">
          <Avatar shape="square" size={64} src={imageSrc} />
        </div>
      </Tooltip>
    );
  } catch {
    return <div>{id}</div>;
  }
};
