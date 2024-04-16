import React from "react";
import { LocalizedObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";
import { Sprite, SpriteDimension, spriteDimension } from "../Sprite";

let dimensions: SpriteDimension | undefined;
let data: any;

export const TcInvestmentAvatar = ({ id, name }: LocalizedObj) => {
  data ??= require(`@/images/eu4/tc-investments/investments.json`);
  dimensions ??= spriteDimension({ data });

  const index = data[id];
  console.log({ id, index, data })
  if (index === undefined) {
    return <div>{id}</div>;
  }

  const src: string = require(`@/images/eu4/tc-investments/investments.webp`);
  return (
    <Tooltip>
      <Tooltip.Trigger className="h-12 w-12">
        <Sprite
          src={src}
          height={48}
          width={48}
          dimensions={dimensions}
          index={index}
          ariaLabel={name}
        />
      </Tooltip.Trigger>
      <Tooltip.Content>{name}</Tooltip.Content>
    </Tooltip>
  );
};
