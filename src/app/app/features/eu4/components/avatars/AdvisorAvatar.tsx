import React from "react";
import { LocalizedObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";
import { cx } from "class-variance-authority";
import { AdvisorImage } from "../AdvisorImage";

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
  const image = (
    <AdvisorImage
      id={localized.id}
      alt=""
      size={48}
      className={cx(!enabled && "grayscale")}
    />
  );
  if (image === null) {
    return <div>{localized.id}</div>;
  }

  return (
    <Tooltip>
      <Tooltip.Trigger>
        <div className="flex items-center gap-x-2">
          {image}
          <div className="flex flex-col items-start">
            <div>{`${localized.name}`}</div>
            <div className="no-break date">{triggerDate || " "}</div>
          </div>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Content>{localized.id}</Tooltip.Content>
    </Tooltip>
  );
};
