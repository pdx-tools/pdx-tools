import { Sprite, spriteDimension } from "@/components/Sprite";
import type { SpriteDimension } from "@/components/Sprite";
import data from "@/images/eu4/achievements/achievements.json";
import achievementImage from "@/images/eu4/achievements/achievements.webp";
import customAchievement from "@/images/eu4/achievements/10000.png";
import { Link } from "@/components/Link";
import React from "react";

type AchievementAvatarProps = Omit<React.ComponentPropsWithoutRef<"a">, "id" | "href"> & {
  id: number | string;
  /** The achievement's name. It becomes the image's alt text, and so the link's name. */
  name?: string;
  size: 40 | 64;
};

let dimensions: SpriteDimension | undefined;

/**
 * An achievement's icon as a link to its leaderboard. The ref and any other
 * props go to the link, so a tooltip or popover can use it as its trigger.
 * Children go into the link after the icon.
 */
export const AchievementAvatar = React.forwardRef<HTMLAnchorElement, AchievementAvatarProps>(
  function AchievementAvatar({ id, name, size, children, ...props }, ref) {
    const alt = name ?? `achievement ${id}`;
    if (id === 10000) {
      return (
        <Link ref={ref} {...props} href={`/eu4/achievements/${id}`}>
          <img src={customAchievement} alt={alt} width={size} height={size} />
          {children}
        </Link>
      );
    }

    // The imports in here are lazy so that they don't fail dev
    // for those that don't have EU4 assets
    dimensions ??= spriteDimension({
      data,
      spriteCell: { width: 64, height: 64 },
    });

    if (!(id in data)) {
      return null;
    }

    const index = data[id as keyof typeof data];
    return (
      <Link ref={ref} {...props} href={`/eu4/achievements/${id}`}>
        <Sprite
          src={achievementImage}
          dimensions={dimensions}
          index={index}
          alt={alt}
          scale={size / 64}
        />
        {children}
      </Link>
    );
  },
);
