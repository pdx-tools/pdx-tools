import React from "react";
import { Tooltip } from "@/components/Tooltip";
import { cx } from "class-variance-authority";
import imageUrl from "./dlc-sprites.webp";
import data from "./dlc-sprites.json";
import { Sprite, spriteDimension } from "../Sprite";

const names = [
  [10, "Conquest of Paradise"],
  [18, "Wealth of Nations"],
  [21, "Res Publica"],
  [27, "Art of War"],
  [33, "El Dorado"],
  [39, "Common Sense"],
  [46, "The Cossacks"],
  [55, "Mare Nostrum"],
  [60, "Rights of Man"],
  [66, "Mandate of Heaven"],
  [72, "Third Rome"],
  [77, "Cradle of Civilization"],
  [84, "Rule Britannia"],
  [90, "Dharma"],
  [95, "Golden Century"],
  [101, "Emperor"],
  [106, "Leviathan"],
  [110, "Origins"],
  [115, "Lions of the North"],
  [119, "Domination"],
  [128, "King of Kings"],
] as const;

const dimensions = spriteDimension({ data });

const dlc = names.map(([id, name]) => [id, name, data[`${id}_s`]] as const);

interface DlcListProps {
  dlc_enabled: number[];
}

export const DlcList = ({ dlc_enabled }: DlcListProps) => {
  const list = dlc.map(([id, name, index]) => {
    const disabled = dlc_enabled.find((x) => x === id) === undefined;
    const contents = `${name}${disabled && " (disabled)"}`;
    return (
      <Tooltip key={id}>
        <Tooltip.Trigger className={cx(disabled && "grayscale")}>
          <Sprite
            src={imageUrl}
            index={index}
            width={24}
            height={24}
            dimensions={dimensions}
            ariaLabel={contents}
          />
        </Tooltip.Trigger>
        <Tooltip.Content>{contents}</Tooltip.Content>
      </Tooltip>
    );
  });

  return <div>{list}</div>;
};
