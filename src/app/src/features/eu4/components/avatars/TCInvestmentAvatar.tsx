import React from "react";
import { LocalizedObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";
import { Sprite, SpriteDimension, spriteDimension } from "../Sprite";

let dimensions: SpriteDimension | undefined;
let data: any;

export const TcInvestmentAvatar = ({ id, name }: LocalizedObj) => {
  data ??= require(`@/images/eu4/tc-investments/investments.json`);
  dimensions ??= spriteDimension({
    data,
    spriteCell: { width: 48, height: 48 },
  });

  const index = data[id];
  if (index === undefined) {
    return <div>{id}</div>;
  }

  const src: string = require(`@/images/eu4/tc-investments/investments.webp`);
  return (
    <Tooltip>
      <Tooltip.Trigger className="h-12 w-12">
        <Sprite src={src} dimensions={dimensions} index={index} alt={name} />
      </Tooltip.Trigger>
      <Tooltip.Content>{name}</Tooltip.Content>
    </Tooltip>
  );
};
