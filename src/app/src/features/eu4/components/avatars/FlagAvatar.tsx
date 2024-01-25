import React, { createContext, useContext } from "react";
import Image from "next/image";
import { useInEu4Analysis } from "../SideBarContainer";
import { useEu4Actions } from "../../store";
import { Tooltip } from "@/components/Tooltip";
import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";
import { check } from "@/lib/isPresent";
import { hasDescendant } from "@/lib/hasDescendant";

type FlagContextState = { name: string; tag: string };
const FlagContext = createContext<FlagContextState | undefined>(undefined);
const useFlag = () =>
  check(useContext(FlagContext), "flag context is undefined");

type CompoundProps = FlagContextState & { children: React.ReactNode };
const RootFlag = (props: CompoundProps | FlagAvatarProps) => {
  return (
    <FlagContext.Provider value={{ name: props.name, tag: props.tag }}>
      {"children" in props ? props.children : <FlagAvatar {...props} />}
    </FlagContext.Provider>
  );
};

export const Flag = RootFlag as typeof RootFlag & {
  Tooltip: typeof FlagTooltip;
  DrawerTrigger: typeof FlagDrawerTrigger;
  Image: typeof FlagImage;
  CountryName: typeof FlagCountryName;
};

const FlagTooltip = React.forwardRef<
  React.ElementRef<typeof Tooltip.Trigger>,
  React.ComponentPropsWithoutRef<typeof Tooltip.Trigger>
>(function FlagTooltip({ children, ...props }, ref) {
  const flag = useFlag();
  const hasFullName = hasDescendant(children, FlagCountryName);
  return (
    <Tooltip>
      <Tooltip.Trigger ref={ref} {...props}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Content>
        {hasFullName ? flag.tag : `${flag.name} (${flag.tag})`}
      </Tooltip.Content>
    </Tooltip>
  );
});
Flag.Tooltip = FlagTooltip;

const FlagDrawerTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Tooltip.Trigger>
>(function FlagDrawerTrigger({ children, className, ...props }, ref) {
  const flag = useFlag();
  const { setSelectedTag } = useEu4Actions();

  return (
    <Button
      ref={ref}
      {...props}
      variant="ghost"
      shape="none"
      className={cx(
        className,
        `w-max flex-shrink-0 rounded-r-md p-0 hover:bg-gray-200/70 active:bg-gray-300`,
      )}
      onClick={() => {
        setSelectedTag(flag.tag);
      }}
    >
      {children}
    </Button>
  );
});
Flag.DrawerTrigger = FlagDrawerTrigger;

type FlagImageProps = Omit<FlagAvatarCoreProps, "tag">;
const FlagImage = (props: FlagImageProps) => {
  const flag = useFlag();
  return <FlagImageImpl tag={flag.tag} {...props} />;
};
Flag.Image = FlagImage;

const FlagCountryName = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(function FlagCountryName(props, ref) {
  const flag = useFlag();

  return (
    <span ref={ref} {...props}>
      {flag.name}
    </span>
  );
});

Flag.CountryName = FlagCountryName;

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
}

const FlagImageImpl = ({ tag, size }: FlagAvatarCoreProps) => {
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

const FlagAvatar = (props: FlagAvatarProps) => {
  const interactive = useInEu4Analysis();
  const flag = <FlagImageImpl {...props} />;
  const withName = (
    <div className="flex flex-shrink-0 gap-x-2 text-left">
      {flag}
      {!props.condensed && <Flag.CountryName />}
    </div>
  );

  const withTrigger = interactive ? (
    <Flag.DrawerTrigger className={!props.condensed ? "pr-4" : ""}>
      {withName}
    </Flag.DrawerTrigger>
  ) : (
    withName
  );

  return <Flag.Tooltip asChild={interactive}>{withTrigger}</Flag.Tooltip>;
};
