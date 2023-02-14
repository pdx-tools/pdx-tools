import React from "react";
import { Avatar, Tooltip } from "antd";
import { LocalizedObj } from "@/features/eu4/types/models";

export const PersonalityAvatar = ({ id, name }: LocalizedObj) => {
  let imageSrc;
  try {
    imageSrc = require(`@/images/eu4/personalities/${id}.png`);
  } catch {}

  if (imageSrc) {
    return (
      <Tooltip title={`${name}`}>
        <div className="space-x-2">
          <Avatar shape="square" size={64} src={imageSrc} />
        </div>
      </Tooltip>
    );
  } else {
    return <div>{id}</div>;
  }
};
