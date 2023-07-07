import React from "react";
import Link from "next/link";
import Image from "next/image";

type AchievementAvatarProps = Omit<
  React.ComponentProps<typeof Image>,
  "src" | "alt" | "id"
> & {
  id: number | string;
};

export const AchievementAvatar = ({
  id,
  className,
  ...rest
}: AchievementAvatarProps) => {
  try {
    const src: string = require(`@/images/eu4/achievements/${id}.png`);
    return (
      <Link className={className} key={id} href={`/eu4/achievements/${id}`}>
        <Image
          src={src}
          width={64}
          height={64}
          alt={`achievement ${id}`}
          {...rest}
        />
      </Link>
    );
  } catch {
    return null;
  }
};
