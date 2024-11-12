import React from "react";
import { LocalizedObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";
import { Sprite, SpriteDimension, spriteDimension } from "../Sprite";
import spriteData from "@/images/eu4/personalities/personalities.json";
import spriteSrc from "@/images/eu4/personalities/personalities.webp";

let dimensions: SpriteDimension | undefined;

export const PersonalityAvatar = ({
  id,
  name,
  size = 64,
}: LocalizedObj & { size?: 64 | 42 }) => {
  dimensions ??= spriteDimension({
    data: spriteData,
    spriteCell: { width: 64, height: 64 },
  });

  if (!(id in spriteData)) {
    return <div>{id}</div>;
  }

  const index = spriteData[id as keyof typeof spriteData];
  return (
    <Tooltip>
      <Tooltip.Trigger style={{ height: size, width: size }}>
        <Sprite
          src={spriteSrc}
          dimensions={dimensions}
          scale={size / 64}
          index={index}
          alt={name}
        />
      </Tooltip.Trigger>
      <Tooltip.Content>{name}</Tooltip.Content>
    </Tooltip>
  );
};
