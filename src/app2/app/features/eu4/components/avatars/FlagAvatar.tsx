import React, { createContext, useContext } from "react";
import {
  useColonialOverlord,
  useEu4Actions,
  useInEu4Analysis,
} from "../../store";
import { Tooltip } from "@/components/Tooltip";
import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";
import { check } from "@/lib/isPresent";
import { Sprite, spriteDimension } from "../Sprite";
import flagJson from "@/images/eu4/flags/flags.json";
import flag8 from "@/images/eu4/flags/flags_x8.webp";
import flag48 from "@/images/eu4/flags/flags_x48.webp";
import flag64 from "@/images/eu4/flags/flags_x64.webp";
import flag128 from "@/images/eu4/flags/flags_x128.webp";
import flagReb from "../../../../../../../assets/game/eu4/common/images/REB.png";

type FlagTag = keyof typeof flagJson;
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

const dimensions = spriteDimension({
  data: flagJson,
  spriteCell: { width: 48, height: 48 },
});

// We need create a small border around flag avatars as some countries
// are white at the edges (like austria). Using a 1px border resulted
// in a weird gap in chrome so we have to use outline with a negative
// offset to account for the avatar's border radius.
const className =
  "shrink-0 outline outline-1 -outline-offset-1 outline-gray-500 dark:outline-gray-800";

function RebFlag({ size }: { size?: AvatarSize }) {
  const factor = sizeFactor(size);
  return (
    <img
      alt=""
      width={128}
      height={128}
      className={className}
      style={{ width: factor * 4, height: factor * 4 }}
      src={flagReb}
    />
  );
}

const FallbackImageImpl = ({ tag, size }: FlagAvatarCoreProps) => {
  const inAnalysis = useInEu4Analysis();
  if (!inAnalysis) {
    return <RebFlag size={size} />;
  } else {
    return <ColonialSubjectFlag tag={tag} size={size} />;
  }
};

const FlagSprite = ({ index, size }: { index: number; size?: AvatarSize }) => {
  const factor = sizeFactor(size);
  return (
    <Sprite
      src={flag48}
      srcSet={[[flag64, "1.33x"], [flag128, "2.66x"]]}
      alt=""
      dimensions={dimensions}
      index={index}
      scale={(factor * 4) / dimensions.spriteCell.height}
      blurSrc={flag8}
    />
  );
};

const ColonialSubjectFlag = ({ tag, size }: FlagAvatarCoreProps) => {
  const overlord = useColonialOverlord(tag);
  if (!overlord) {
    return <RebFlag size={size} />;
  }

  if (!(overlord[0] in flagJson)) {
    return <RebFlag size={size} />;
  }

  const overlordIndex = flagJson[overlord[0] as FlagTag];
  const [r, g, b] = overlord[1];
  return (
    <div className="flex">
      <div className="relative">
        <FlagSprite index={overlordIndex} size={size} />
        <div
          className="absolute bottom-0 right-0 top-0 w-1/2"
          style={{ backgroundColor: `rgb(${r},${g},${b})` }}
        />
      </div>
    </div>
  );
};

const FlagImageImpl = ({ tag, size }: FlagAvatarCoreProps) => {
  if (tag in flagJson) {
    return <FlagSprite index={flagJson[tag as FlagTag]} size={size} />;
  } else {
    return <FallbackImageImpl tag={tag} size={size} />;
  }
};

const FlagAvatar = (props: FlagAvatarProps) => {
  const interactive = useInEu4Analysis();
  const flag = <FlagImageImpl {...props} />;
  const withName = (
    <div className="flex flex-shrink-0 items-center gap-x-2 text-left">
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
