import React from "react";
import { GfxObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";
import { Sprite, SpriteDimension, spriteDimension } from "../Sprite";
import globalSpriteData from "@/images/eu4/buildings/global.json";
import westernSpriteData from "@/images/eu4/buildings/westerngfx.json";
import globalSpriteSrc from "@/images/eu4/buildings/global.webp";
import westernSpriteSrc from "@/images/eu4/buildings/westerngfx.webp";

type BuildingProps = GfxObj & {
  condensed?: boolean;
};

let westernDimensions: SpriteDimension | undefined;

let globalDimensions: SpriteDimension | undefined;
const spriteCell = { width: 48, height: 48 };

export const BuildingAvatar = ({ id, name, gfx, condensed }: BuildingProps) => {
  globalDimensions ??= spriteDimension({ data: globalSpriteData, spriteCell });
  westernDimensions ??= spriteDimension({ data: westernSpriteData, spriteCell });

  const westernKey = `${id}_${gfx}`
  let avatar;
  if (id in globalSpriteData) {
    avatar = (
      <Sprite
        src={globalSpriteSrc}
        index={globalSpriteData[id as keyof typeof globalSpriteData]}
        dimensions={globalDimensions}
        alt={name}
      />
    );
  } else if (westernKey in westernSpriteData) {
    avatar = (
      <Sprite
        src={westernSpriteSrc}
        index={westernSpriteData[westernKey as keyof typeof westernSpriteData]}
        dimensions={westernDimensions}
        alt={name}
      />
    );
  } else {
    return <div>{id}</div>;
  }

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
