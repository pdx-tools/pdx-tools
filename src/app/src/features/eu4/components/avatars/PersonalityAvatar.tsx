import React from "react";
import { Avatar, Space, Tooltip } from "antd";
import { LocalizedObj } from "@/features/eu4/types/models";

export const PersonalityAvatar: React.FC<LocalizedObj> = ({ id, name }) => {
  let imageSrc;
  try {
    imageSrc = require(`@/images/eu4/personalities/${id}.png`);
  } catch {}

  if (imageSrc) {
    return (
      <Tooltip title={`${name}`}>
        <Space>
          <Avatar shape="square" size={64} src={imageSrc} />
        </Space>
      </Tooltip>
    );
  } else {
    return <div>{id}</div>;
  }
};
