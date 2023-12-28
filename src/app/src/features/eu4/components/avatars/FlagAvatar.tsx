import React from "react";
import Image from "next/image";
import { useInEu4Analysis } from "../SideBarContainer";
import { useEu4Actions } from "../../store";
import { Tooltip } from "@/components/Tooltip";
import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";

type AvatarSize = "xs" | "small" | "base" | "large";
interface FlagAvatarCoreProps {
  tag: string;
  size?: AvatarSize;
}

interface FlagAvatarProps {
  tag: string;
  name: string;
  size?: AvatarSize;
  condensed?: boolean;
  static?: boolean;
}

export const FlagAvatarCore = ({ tag, size }: FlagAvatarCoreProps) => {
  let src: string;
  try {
    src = require(`@/images/eu4/flags/${tag}.png`);
  } catch {
    try {
      src = require(`@/images/eu4/flags/REB.png`);
    } catch {
      return null;
    }
  }

  let dims = "h-10 w-10";
  if (size === "xs") {
    dims = "h-5 w-5";
  } else if (size === "small") {
    dims = "h-8 w-8";
  } else if (size === "large") {
    dims = "h-12 w-12";
  }

  // We need create a small border around flag avatars as some countries
  // are white at the edges (like austria). Using a 1px border resulted
  // in a weird gap in chrome so we have to use outline with a negative
  // offset to account for the avatar's border radius.
  return (
    <Image
      alt=""
      width={128}
      height={128}
      className={cx(
        dims,
        "shrink-0 outline outline-1 -outline-offset-1 outline-gray-500",
      )}
      src={src}
    />
  );
};

const InGameFlagAvatar = ({
  tag,
  name,
  size,
  condensed = false,
}: FlagAvatarProps) => {
  return (
    <TagFlag tag={tag} size={size} tooltip={condensed ? { name } : "tag"}>
      {!condensed ? <span>{name}</span> : null}
    </TagFlag>
  );
};

const OutOfGameFlagAvatar = ({
  tag,
  name,
  size,
  condensed = false,
}: FlagAvatarProps) => {
  return (
    <Tooltip>
      <Tooltip.Trigger className="inline-block gap-2 text-start">
        <FlagAvatarCore tag={tag} size={size} />
        {!condensed ? <span className="text-left">{name}</span> : null}
      </Tooltip.Trigger>
      <Tooltip.Content>{condensed ? `${name} (${tag})` : tag}</Tooltip.Content>
    </Tooltip>
  );
};

export const FlagAvatar = (props: FlagAvatarProps) => {
  // If we're using a flag avatar inside eu4 then we can pan to the map
  if (useInEu4Analysis() && props.static !== true) {
    return <InGameFlagAvatar {...props} />;
  } else {
    return <OutOfGameFlagAvatar {...props} />;
  }
};

export const TagFlag = ({
  tag,
  size,
  tooltip,
  children,
}: React.PropsWithChildren<
  FlagAvatarCoreProps & { tooltip?: "tag" | { name: string } }
>) => {
  const { setSelectedTag } = useEu4Actions();

  const content = (
    <Button
      variant="ghost"
      shape="none"
      className={cx(
        `w-max flex-shrink-0 rounded-r-md p-0 hover:bg-gray-200/70 active:bg-gray-300`,
        children && "pr-4",
      )}
      onClick={() => setSelectedTag(tag)}
    >
      <div className="flex flex-shrink-0 gap-x-2 text-left">
        <FlagAvatarCore tag={tag} size={size} />
        {children && <span>{children}</span>}
      </div>
    </Button>
  );

  switch (tooltip) {
    case undefined: {
      return content;
    }
    case "tag": {
      return (
        <Tooltip>
          <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
          <Tooltip.Content>{tag}</Tooltip.Content>
        </Tooltip>
      );
    }
    default: {
      return (
        <Tooltip>
          <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
          <Tooltip.Content>
            {tooltip.name} ({tag})
          </Tooltip.Content>
        </Tooltip>
      );
    }
  }
};
