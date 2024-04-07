import React from "react";
import Image from "next/image";
import { GfxObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";
import { Sprite, SpriteDimension, spriteDimension } from "../Sprite";

type BuildingProps = GfxObj & {
  condensed?: boolean;
};

let westernDimensions: SpriteDimension | undefined;
let westernData: any;

let globalDimensions: SpriteDimension | undefined;
let globalData: any;

export const BuildingAvatar = ({ id, name, gfx, condensed }: BuildingProps) => {
  globalData ??= require(`@/images/eu4/buildings/global.json`);
  globalDimensions ??= spriteDimension({ data: globalData });

  westernData ??= require(`@/images/eu4/buildings/westerngfx.json`);
  westernDimensions ??= spriteDimension({ data: westernData });

  const globalIndex = globalData[id];
  const westernIndex = westernData[`${id}_${gfx}`];
  let avatar;
  if (globalIndex !== undefined) {
    avatar = (
      <Sprite
        src={require(`@/images/eu4/buildings/global.webp`)}
        index={globalIndex}
        dimensions={globalDimensions}
        height={48}
        width={48}
        ariaLabel={name}
      />
    );
  } else if (westernIndex !== undefined) {
    avatar = (
      <Sprite
        src={require(`@/images/eu4/buildings/westerngfx.webp`)}
        index={westernIndex}
        dimensions={westernDimensions}
        height={48}
        width={48}
        ariaLabel={name}
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
