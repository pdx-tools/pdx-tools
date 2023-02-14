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
        <div className="space-x-2">
          <Avatar shape="square" size={48} src={imageSrc} />
        </div>
      </Tooltip>
    );
  } else {
    return <div>{id}</div>;
  }
};
