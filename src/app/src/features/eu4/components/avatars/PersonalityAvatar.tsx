import React from "react";
import Image from "next/image";
import { LocalizedObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";

export const PersonalityAvatar = ({ id, name }: LocalizedObj) => {
  try {
    const src: string = require(`@/images/eu4/personalities/${id}.png`);
    return (
      <Tooltip>
        <Tooltip.Trigger className="h-16 w-16">
          <Image src={src} width={64} height={64} alt={name} />
        </Tooltip.Trigger>
        <Tooltip.Content>{name}</Tooltip.Content>
      </Tooltip>
    );
  } catch {
    return <div>{id}</div>;
  }
};
