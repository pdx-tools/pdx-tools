import React from "react";
import { Sprite, SpriteDimension, spriteDimension } from "../Sprite";
import Link from "next/link";
import data from "@/images/eu4/achievements/achievements.json";
import achievementImage from "@/images/eu4/achievements/achievements.webp";

type AchievementAvatarProps = {
  id: number | string;
  className?: string;
  size: 40 | 64;
};

let dimensions: SpriteDimension | undefined;

export const AchievementAvatar = ({
  id,
  className,
  size,
}: AchievementAvatarProps) => {
  // The imports in here are lazy so that they don't fail dev
  // for those that don't have EU4 assets
  dimensions ??= spriteDimension({
    data,
    spriteCell: { width: 64, height: 64 },
  });
  const index = data[id];
  if (index === undefined) {
    return null;
  }

  return (
    <Link className={className} key={id} href={`/eu4/achievements/${id}`}>
      <Sprite
        src={achievementImage}
        dimensions={dimensions}
        index={index}
        alt={`achievement ${id}`}
        scale={size / 64}
        className={className}
      />
    </Link>
  );
};
