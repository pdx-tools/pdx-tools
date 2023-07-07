import React from "react";
import Image from "next/image";
import { LocalizedObj } from "@/features/eu4/types/models";
import { Tooltip } from "@/components/Tooltip";

export const TcInvestmentAvatar = ({ id, name }: LocalizedObj) => {
  try {
    const src: string = require(`@/images/eu4/tc-investments/${id}.png`);
    return (
      <Tooltip>
        <Tooltip.Trigger className="h-12 w-12">
          <Image src={src} width={48} height={48} alt={name} />
        </Tooltip.Trigger>
        <Tooltip.Content>{name}</Tooltip.Content>
      </Tooltip>
    );
  } catch {
    return <div>{id}</div>;
  }
};
