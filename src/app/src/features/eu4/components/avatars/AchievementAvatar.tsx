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
  return (
    <Link key={id} href={`/eu4/achievements/${id}`}>
      <a>
        <Avatar
          size={size || "small"}
          shape="square"
          src={require(`@/images/eu4/achievements/${id}.png`)}
        />
      </a>
    </Link>
  );
};
