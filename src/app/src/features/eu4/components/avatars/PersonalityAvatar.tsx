import React from "react";
import { LocalizedObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";
import { Sprite, SpriteDimension, spriteDimension } from "../Sprite";

let dimensions: SpriteDimension | undefined;
let data: any;

export const PersonalityAvatar = ({
  id,
  name,
  size = 64,
}: LocalizedObj & { size?: 64 | 42 }) => {
  data ??= require(`@/images/eu4/personalities/personalities.json`);
  dimensions ??= spriteDimension({ data });
  const index = data[id];
  if (index === undefined) {
    return <div>{id}</div>;
  }

  return (
    <Tooltip>
      <Tooltip.Trigger style={{ height: size, width: size }}>
        <Sprite
          src={require("@/images/eu4/personalities/personalities.webp")}
          height={size}
          width={size}
          dimensions={dimensions}
          index={index}
          ariaLabel={name}
        />
      </Tooltip.Trigger>
      <Tooltip.Content>{name}</Tooltip.Content>
    </Tooltip>
  );
};
