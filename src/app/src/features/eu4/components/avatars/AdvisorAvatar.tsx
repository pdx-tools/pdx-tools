import React from "react";
import { Avatar, Space, Tooltip } from "antd";
import { LocalizedObj } from "@/features/eu4/types/models";

type AdvisorAvatarProps = {
  triggerDate: string | undefined;
  localized: LocalizedObj;
  enabled: boolean;
};

export const AdvisorAvatar: React.FC<AdvisorAvatarProps> = ({
  triggerDate,
  localized,
  enabled,
}) => {
  let image;
  try {
    image = require(`@/images/eu4/advisors/${localized.id}.png`);
  } catch {}

  if (image) {
    const style = enabled ? {} : { filter: "grayscale(1)" };
    return (
      <Tooltip title={`${localized.id}`}>
        <Space>
          <Avatar shape="square" size={48} src={image} style={style} />
          <div>
            <div>{`${localized.name}`}</div>
            <div className="no-break date">{triggerDate || " "}</div>
          </div>
        </Space>
      </Tooltip>
    );
  } else {
    return <div>{localized.id}</div>;
  }
};
