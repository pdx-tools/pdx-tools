import React from "react";
import Image from "next/image";
import { GfxObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";

type BuildingProps = GfxObj & {
  condensed?: boolean;
};

export const BuildingAvatar = ({ id, name, gfx, condensed }: BuildingProps) => {
  let src: string;
  try {
    src = require(`@/images/eu4/buildings/${id}_${gfx}.png`);
  } catch {
    try {
      src = require(`@/images/eu4/buildings/${id}.png`);
    } catch {
      return <div>{id}</div>;
    }
  }

  const avatar = (
    <Image src={src} alt={name} width={48} height={48} className="h-12 w-12" />
  );

  if (condensed) {
    return (
      <Tooltip>
        <Tooltip.Trigger>{avatar}</Tooltip.Trigger>
        <Tooltip.Content>{name}</Tooltip.Content>
      </Tooltip>
    );
  } else {
    return (
      <Tooltip>
        <Tooltip.Trigger className="flex items-center space-x-2">
          {avatar}
          <span className="text-left">{name}</span>
        </Tooltip.Trigger>
        <Tooltip.Content>{id}</Tooltip.Content>
      </Tooltip>
    );
  }
};
