import React from "react";
import { Avatar } from "antd";
import Link from "next/link";

type AchievementAvatarProps = Pick<
  React.ComponentProps<typeof Avatar>,
  "size"
> & {
  id: number | string;
};

export const AchievementAvatar = ({ id, size }: AchievementAvatarProps) => {
  try {
    const src: string = require(`@/images/eu4/achievements/${id}.png`);
    return (
      <Link key={id} href={`/eu4/achievements/${id}`}>
        <Avatar size={size || "small"} shape="square" src={src} />
      </Link>
    );
  } catch {
    return null;
  }
};
