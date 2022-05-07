import React from "react";
import { Avatar, Space, Tooltip } from "antd";
import { LocalizedObj } from "@/features/eu4/types/models";

export const TcInvestmentAvatar = ({ id, name }: LocalizedObj) => {
  let imageSrc;
  try {
    imageSrc = require(`@/images/eu4/tc-investments/${id}.png`);
  } catch {}

  if (imageSrc) {
    return (
      <Tooltip title={`${name}`}>
        <Space>
          <Avatar shape="square" size={48} src={imageSrc} />
        </Space>
      </Tooltip>
    );
  } else {
    return <div>{id}</div>;
  }
};
