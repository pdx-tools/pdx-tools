import React from "react";
import { Avatar, Tooltip } from "antd";
import { useInEu4Analysis } from "../SideBarContainer";
import { useEu4Actions } from "../../store";

type AvatarProps = React.ComponentProps<typeof Avatar>;
interface FlagAvatarCoreProps {
  tag: string;
  size?: AvatarProps["size"];
}

interface FlagAvatarProps {
  tag: string;
  name: string;
  size?: AvatarProps["size"];
  condensed?: boolean;
}

export const FlagAvatarCore = ({ tag, size }: FlagAvatarCoreProps) => {
  let flag_src = "";
  try {
    flag_src = require(`@/images/eu4/flags/${tag}.png`);
  } catch {
    flag_src = require(`@/images/eu4/flags/REB.png`);
  }

  // We need create a small border around flag avatars as some countries
  // are white at the edges (like austria). Using a 1px border resulted
  // in a weird gap in chrome so we have to use outline with a negative
  // offset to account for the avatar's border radius.
  const style = {
    outline: "1px solid #666",
    outlineOffset: "-1px",
  };

  return (
    <Avatar
      shape="square"
      size={size || "small"}
      src={flag_src}
      style={style}
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

const OutOfGameFlagAvatar = ({ tag, name, size }: FlagAvatarProps) => {
  return (
    <Tooltip title={tag}>
      <div className="flex items-center space-x-2 text-start">
        <FlagAvatarCore tag={tag} size={size} />
        <span>{name}</span>
      </div>
    </Tooltip>
  );
};

export const FlagAvatar = (props: FlagAvatarProps) => {
  // If we're using a flag avatar inside eu4 then we can pan to the map
  if (useInEu4Analysis()) {
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
    <button
      className="cursor-pointer border-none bg-transparent p-1 hover:bg-gray-200 active:bg-gray-300"
      onClick={() => setSelectedTag(tag)}
    >
      <div className="flex gap-x-2">
        <FlagAvatarCore tag={tag} size={size} />
        {children}
      </div>
    </button>
  );

  switch (tooltip) {
    case undefined: {
      return content;
    }
    case "tag": {
      return <Tooltip title={tag}>{content}</Tooltip>;
    }
    default: {
      return <Tooltip title={`${tooltip.name} (${tag})`}>{content}</Tooltip>;
    }
  }
};
