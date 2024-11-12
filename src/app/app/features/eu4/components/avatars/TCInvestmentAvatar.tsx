import React from "react";
import { LocalizedObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";
import { Sprite, SpriteDimension, spriteDimension } from "../Sprite";
import investmentData from "@/images/eu4/tc-investments/investments.json";
import investmentImage from "@/images/eu4/tc-investments/investments.webp";

let dimensions: SpriteDimension | undefined;

export const TcInvestmentAvatar = ({ id, name }: LocalizedObj) => {
  dimensions ??= spriteDimension({
    data: investmentData,
    spriteCell: { width: 48, height: 48 },
  });

  if (!(id in investmentData)) {
    return <div>{id}</div>;
  }

  const index = investmentData[id as keyof typeof investmentData];
  return (
    <Tooltip>
      <Tooltip.Trigger className="h-12 w-12">
        <Sprite
          src={investmentImage}
          dimensions={dimensions}
          index={index}
          alt={name}
        />
      </Tooltip.Trigger>
      <Tooltip.Content>{name}</Tooltip.Content>
    </Tooltip>
  );
};
