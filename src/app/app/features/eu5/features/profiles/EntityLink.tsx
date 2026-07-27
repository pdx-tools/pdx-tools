import type React from "react";
import { cx } from "class-variance-authority";
import type { CountryRef, MarketRef } from "@/wasm/wasm_eu5";
import { usePanelNav, entityProfileEntry } from "./PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { useEu5Engine } from "../../store";
import { useEu5MapHoverTarget } from "../../useEu5MapHoverTarget";
import type { Eu5MapHoverTarget } from "../../useEu5MapHoverTarget";
import { EntityName, entityLinkControl } from "../../components/EntityName";
import { Eu5Flag } from "../../components/flags/Eu5Flag";
import type { Eu5FlagSize } from "../../components/flags/Eu5Flag";

const sizeClasses = {
  xs: {
    wrapper: "gap-[5px] h-[18px]",
    swatch: "w-[12px] h-[9px]",
    tag: "text-[9.5px]",
    name: "text-[11px]",
  },
  sm: {
    wrapper: "gap-1.5 h-[22px]",
    swatch: "w-[14px] h-[10px]",
    tag: "text-[10px]",
    name: "text-[12px]",
  },
  md: {
    wrapper: "gap-2 h-7",
    swatch: "w-[18px] h-3",
    tag: "text-[10.5px]",
    name: "text-[13.5px]",
  },
};

type Size = keyof typeof sizeClasses;

type SharedProps = {
  size?: Size;
  aligned?: boolean;
  backLabel?: string;
  className?: string;
  children?: React.ReactNode;
  static?: boolean;
};

function EntitySwatch({
  colorHex,
  isPlayer,
  className,
}: {
  colorHex: string;
  isPlayer?: boolean;
  className: string;
}) {
  return (
    <span
      className={cx(
        "relative shrink-0 rounded-[1px] border border-black/30",
        isPlayer && "ring-2 ring-game-ink-100 ring-offset-1 ring-offset-game-page",
        className,
      )}
      style={{ backgroundColor: colorHex }}
    />
  );
}

type LinkBodyProps = SharedProps & {
  kind: "country" | "market";
  id: number;
  anchorLocationIdx: number;
  hoverTarget: Eu5MapHoverTarget;
  colorHex: string;
  isPlayer: boolean;
  visual?: React.ReactNode;
  tag?: React.ReactNode;
  name: string;
  onAltActivate: () => void;
};

function LinkBody({
  kind,
  id,
  anchorLocationIdx,
  hoverTarget,
  colorHex,
  isPlayer,
  visual,
  tag,
  name,
  onAltActivate,
  backLabel,
  size = "sm",
  className,
  children,
  ...rest
}: LinkBodyProps) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();
  const s = sizeClasses[size];
  const hoverProps = useEu5MapHoverTarget(hoverTarget);
  const nameClass = cx(
    "min-w-0 flex-[0_1_auto] overflow-hidden font-medium text-ellipsis whitespace-nowrap",
    s.name,
  );
  const content = (
    <>
      {visual ?? <EntitySwatch colorHex={colorHex} isPlayer={isPlayer} className={s.swatch} />}
      {tag}
      {children ??
        (rest.static ? (
          <span className={cx(nameClass, "text-game-ink-100")}>{name}</span>
        ) : (
          <EntityName className={nameClass}>{name}</EntityName>
        ))}
    </>
  );

  if (rest.static) {
    return (
      <span
        {...hoverProps}
        className={cx("inline-flex max-w-full min-w-0 items-center", s.wrapper, className)}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (event.altKey) {
          onAltActivate();
          return;
        }
        nav.pushMany([entityProfileEntry(kind, id, name)], backLabel);
        panToEntity(anchorLocationIdx);
      }}
      {...hoverProps}
      className={cx(
        entityLinkControl,
        "inline-flex max-w-full min-w-0 cursor-pointer items-center border-0 bg-transparent p-0 text-left align-middle",
        s.wrapper,
        className,
      )}
    >
      {content}
    </button>
  );
}

const flagSizeByLinkSize: Record<Size, Eu5FlagSize> = {
  xs: "xs",
  sm: "sm",
  md: "base",
};

export function CountryLink({ country, ...props }: SharedProps & { country: CountryRef }) {
  const engine = useEu5Engine();
  const s = sizeClasses[props.size ?? "sm"];

  const tag = (
    <span
      className={cx(
        "shrink-0 font-game-num tracking-[0.06em] text-game-ink-500",
        props.aligned && "min-w-[calc(5ch+0.3em)]",
        s.tag,
      )}
    >
      {country.tag}
    </span>
  );

  return (
    <LinkBody
      {...props}
      kind="country"
      id={country.country.key}
      anchorLocationIdx={country.anchorLocationIdx}
      hoverTarget={{ kind: "country", countryIdx: country.country.key }}
      colorHex={country.colorHex}
      isPlayer={country.isPlayer}
      visual={
        <Eu5Flag
          flag={country.flag}
          colorHex={country.colorHex}
          size={flagSizeByLinkSize[props.size ?? "sm"]}
          className={cx(
            "shrink-0 rounded-[1px] border border-black/30",
            country.isPlayer && "ring-2 ring-game-ink-100 ring-offset-1 ring-offset-game-page",
          )}
        />
      }
      tag={tag}
      name={country.country.name}
      onAltActivate={() => void engine.trigger.removeCountry(country.country.key)}
    />
  );
}

export function MarketLink({ market, ...props }: SharedProps & { market: MarketRef }) {
  const engine = useEu5Engine();

  return (
    <LinkBody
      {...props}
      kind="market"
      id={market.market.key}
      anchorLocationIdx={market.anchorLocationIdx}
      hoverTarget={{ kind: "market", marketId: market.market.key }}
      colorHex={market.colorHex}
      isPlayer={false}
      name={market.market.name}
      onAltActivate={() => void engine.trigger.removeMarket(market.market.key)}
    />
  );
}
