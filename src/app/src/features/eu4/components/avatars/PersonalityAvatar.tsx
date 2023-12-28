import React from "react";
import Image from "next/image";
import { LocalizedObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";

export const PersonalityAvatar = ({
  id,
  name,
  size = 64,
}: LocalizedObj & { size?: number }) => {
  try {
    const src: string = require(`@/images/eu4/personalities/${id}.png`);
    return (
      <Tooltip>
        <Tooltip.Trigger style={{ height: size, width: size }}>
          <Image src={src} width={64} height={64} alt={name} />
        </Tooltip.Trigger>
        <Tooltip.Content>{name}</Tooltip.Content>
      </Tooltip>
    );
  } catch {
    return <div>{id}</div>;
  }
};
