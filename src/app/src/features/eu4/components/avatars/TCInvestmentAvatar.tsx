import React from "react";
import { Avatar, Tooltip } from "antd";
import { LocalizedObj } from "@/features/eu4/types/models";

export const TcInvestmentAvatar = ({ id, name }: LocalizedObj) => {
  try {
    const imageSrc: string = require(`@/images/eu4/tc-investments/${id}.png`);
    return (
      <Tooltip title={`${name}`}>
        <div className="space-x-2">
          <Avatar shape="square" size={48} src={imageSrc} />
        </div>
      </Tooltip>
    );
  } catch {
    return <div>{id}</div>;
  }
};
