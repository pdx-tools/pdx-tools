import React from "react";
import { Avatar, Tooltip } from "antd";
import { usePanTag } from "../../hooks/usePanTag";
import { useInEu4Analysis } from "../SideBarContainer";

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
  const panTag = usePanTag();
  if (!condensed) {
    return (
      <Tooltip title={tag}>
        <button
          className="cursor-pointer border-none bg-transparent p-1 hover:bg-gray-200 active:bg-gray-300"
          onClick={() => panTag(tag)}
        >
          <div className="flex items-center space-x-2 text-start">
            <FlagAvatarCore tag={tag} size={size} />
            <span>{name}</span>
          </div>
        </button>
      </Tooltip>
    );
  } else {
    return (
      <Tooltip title={`${name} (${tag})`}>
        <button
          className="cursor-pointer border-none bg-transparent p-1 hover:bg-gray-200 active:bg-gray-300"
          onClick={() => panTag(tag)}
        >
          <FlagAvatarCore tag={tag} size={size} />
        </button>
      </Tooltip>
    );
  }
};

const OutOfGameFlagAvatar = ({
  tag,
  name,
  size,
  condensed = false,
}: FlagAvatarProps) => {
  if (!condensed) {
    return (
      <Tooltip title={tag}>
        <div className="flex items-center space-x-2 text-start">
          <FlagAvatarCore tag={tag} size={size} />
          <span>{name}</span>
        </div>
      </Tooltip>
    );
  } else {
    return (
      <Tooltip title={`${name} (${tag})`}>
        <FlagAvatarCore tag={tag} size={size} />
      </Tooltip>
    );
  }
};

export const FlagAvatar = (props: FlagAvatarProps) => {
  // If we're using a flag avatar inside eu4 then we can pan to the map
  if (useInEu4Analysis()) {
    return <InGameFlagAvatar {...props} />;
  } else {
    return <OutOfGameFlagAvatar {...props} />;
  }
};
