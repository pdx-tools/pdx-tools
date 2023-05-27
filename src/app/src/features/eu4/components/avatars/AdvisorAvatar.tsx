import React from "react";
import { Avatar, Tooltip } from "antd";
import { LocalizedObj } from "@/features/eu4/types/models";

type AdvisorAvatarProps = {
  triggerDate: string | undefined;
  localized: LocalizedObj;
  enabled: boolean;
};

export const AdvisorAvatar = ({
  triggerDate,
  localized,
  enabled,
}: AdvisorAvatarProps) => {
  try {
    const src: string = require(`@/images/eu4/advisors/${localized.id}.png`);
    const style = enabled ? {} : { filter: "grayscale(1)" };
    return (
      <Tooltip title={`${localized.id}`}>
        <div className="flex items-center gap-x-2">
          <Avatar shape="square" size={48} src={src} style={style} />
          <div>
            <div>{`${localized.name}`}</div>
            <div className="no-break date">{triggerDate || " "}</div>
          </div>
        </div>
      </Tooltip>
    );
  } catch {
    return <div>{localized.id}</div>;
  }
};
