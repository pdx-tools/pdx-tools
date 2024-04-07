import React from "react";
import { Sprite, SpriteDimension, spriteDimension } from "../Sprite";

type AchievementAvatarProps = {
  id: number | string;
  className?: string;
  size: 40 | 64;
};

let dimensions: SpriteDimension | undefined;
let data: any;

export const AchievementAvatar = ({
  id,
  className,
  size,
}: AchievementAvatarProps) => {
  // The imports in here are lazy so that they don't fail dev
  // for those that don't have EU4 assets
  data ??= require(`@/images/eu4/achievements/achievements.json`);
  dimensions ??= spriteDimension({ data });
  const index = data[id];
  if (index === undefined) {
    return null;
  }

  return (
    <Sprite
      src={require("@/images/eu4/achievements/achievements.webp")}
      dimensions={dimensions}
      index={index}
      height={size}
      width={size}
      ariaLabel={`achievement ${id}`}
      className={className}
    />
  );
};
