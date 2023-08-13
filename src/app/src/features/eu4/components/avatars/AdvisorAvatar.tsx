import React from "react";
import Image from "next/image";
import { LocalizedObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";
import { cx } from "class-variance-authority";

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
    return (
      <Tooltip>
        <Tooltip.Trigger>
          <div className="flex items-center gap-x-2">
            <Image
              src={src}
              width={77}
              height={77}
              className={cx("h-12 w-12", !enabled && "grayscale")}
              alt=""
            />
            <div className="flex flex-col items-start">
              <div>{`${localized.name}`}</div>
              <div className="no-break date">{triggerDate || " "}</div>
            </div>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content>{localized.id}</Tooltip.Content>
      </Tooltip>
    );
  } catch {
    return <div>{localized.id}</div>;
  }
};
