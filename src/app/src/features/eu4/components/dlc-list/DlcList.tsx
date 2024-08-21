import React from "react";
import { Tooltip } from "@/components/Tooltip";
import { cx } from "class-variance-authority";
import imageUrl from "./dlc-sprites.webp";
import data from "./dlc-sprites.json";
import { Sprite, spriteDimension } from "../Sprite";

const dimensions = spriteDimension({
  data,
  spriteCell: { width: 37, height: 37 },
});

interface DlcListProps {
  dlc_enabled: string[];
}

export const DlcList = ({ dlc_enabled }: DlcListProps) => {
  const list = Object.entries(data).map(([dlc, spriteIndex]) => {
    const disabled = dlc_enabled.find((x) => x === dlc) === undefined;
    const contents = `${dlc}${!disabled ? "" : " (disabled)"}`;
    return (
      <Tooltip key={dlc}>
        <Tooltip.Trigger className={cx(disabled && "grayscale")}>
          <Sprite
            src={imageUrl}
            index={spriteIndex}
            dimensions={dimensions}
            alt={contents}
            scale={24 / 37}
          />
        </Tooltip.Trigger>
        <Tooltip.Content>{contents}</Tooltip.Content>
      </Tooltip>
    );
  });

  return <div className="flex flex-wrap justify-center">{list}</div>;
};
