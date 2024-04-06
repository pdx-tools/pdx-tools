import React, { createContext, useContext } from "react";
import Image from "next/image";
import { useInEu4Analysis } from "../SideBarContainer";
import { useEu4Actions } from "../../store";
import { Tooltip } from "@/components/Tooltip";
import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";
import { check } from "@/lib/isPresent";

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
  React.ComponentPropsWithoutRef<typeof Tooltip.Trigger> & {
    showName?: boolean;
  }
>(function FlagTooltip({ children, showName, ...props }, ref) {
  const flag = useFlag();
  return (
    <Tooltip>
      <Tooltip.Trigger ref={ref} {...props}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Content>
        {showName ? `${flag.name} (${flag.tag})` : flag.tag}
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
        `w-max flex-shrink-0 rounded-r-md p-0 hover:bg-gray-200/70 active:bg-gray-300 dark:hover:bg-slate-700/70 dark:active:bg-slate-700`,
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

function sizeFactor(size?: AvatarSize): number {
  switch (size) {
    case "large":
      return 12;
    case "small":
      return 8;
    case "xs":
      return 5;
    case "base":
    default:
      return 10;
  }
}

let flagsPerRow: number | undefined;

const FlagImageImpl = ({ tag, size }: FlagAvatarCoreProps) => {
  const data = require(`@/images/eu4/flags/flags.json`);
  const index = data[tag];
  const factor = sizeFactor(size);

  // We need create a small border around flag avatars as some countries
  // are white at the edges (like austria). Using a 1px border resulted
  // in a weird gap in chrome so we have to use outline with a negative
  // offset to account for the avatar's border radius.
  const className =
    "shrink-0 outline outline-1 -outline-offset-1 outline-gray-500 dark:outline-gray-800";

  if (index === undefined) {
    return (
      <Image
        alt=""
        width={128}
        height={128}
        className={className}
        style={{ width: factor * 4, height: factor * 4 }}
        src={require(
          `../../../../../../../assets/game/eu4/common/images/REB.png`,
        )}
      />
    );
  } else {
    if (flagsPerRow === undefined) {
      flagsPerRow = Math.ceil(Math.sqrt(Object.keys(data).length));
    }

    const row = Math.floor(index / flagsPerRow);
    const col = index % flagsPerRow;
    return (
      <div
        role="img"
        className={className}
        style={{
          width: factor * 4,
          height: factor * 4,
          backgroundImage: `url(${require(`@/images/eu4/flags/flags.webp`)})`,
          backgroundPosition: `-${col * factor * 4}px -${row * factor * 4}px`,
          backgroundSize: `${flagsPerRow * 100}% ${flagsPerRow * 100}%`,
        }}
      />
    );
  }
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

  return (
    <Flag.Tooltip asChild={interactive} showName={props.condensed}>
      {withTrigger}
    </Flag.Tooltip>
  );
};
