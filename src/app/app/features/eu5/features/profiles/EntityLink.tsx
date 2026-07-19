import type React from "react";
import { cx } from "class-variance-authority";
import type { CountryRef, MarketRef } from "@/wasm/wasm_eu5";
import { usePanelNav, entityProfileEntry } from "./PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { useEu5Engine } from "../../store";
import { useEu5MapHoverTarget } from "../../useEu5MapHoverTarget";
import type { Eu5MapHoverTarget } from "../../useEu5MapHoverTarget";
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
} & ({ static?: false } | { static: true });

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
  hoverTarget: Eu5MapHoverTarget;
  colorHex: string;
  isPlayer: boolean;
  visual?: React.ReactNode;
  tag?: React.ReactNode;
  name: string;
  onActivate: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

function LinkBody({
  hoverTarget,
  colorHex,
  isPlayer,
  visual,
  tag,
  name,
  onActivate,
  size = "sm",
  className,
  children,
  ...rest
}: LinkBodyProps) {
  const s = sizeClasses[size];
  const hoverProps = useEu5MapHoverTarget(hoverTarget);

  if (rest.static) {
    return (
      <span
        {...hoverProps}
        className={cx("inline-flex max-w-full min-w-0 items-center", s.wrapper, className)}
      >
        {visual ?? <EntitySwatch colorHex={colorHex} isPlayer={isPlayer} className={s.swatch} />}
        {tag}
        {children ?? (
          <span
            className={cx(
              "min-w-0 flex-[0_1_auto] overflow-hidden font-medium text-ellipsis whitespace-nowrap text-game-ink-100",
              s.name,
            )}
          >
            {name}
          </span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      {...hoverProps}
      className={cx(
        "group/er inline-flex max-w-full min-w-0 cursor-pointer items-center border-0 bg-transparent p-0 text-left align-middle",
        s.wrapper,
        className,
      )}
    >
      {visual ?? <EntitySwatch colorHex={colorHex} isPlayer={isPlayer} className={s.swatch} />}
      {tag}
      {children ?? (
        <span
          className={cx(
            "min-w-0 flex-[0_1_auto] overflow-hidden font-medium text-ellipsis whitespace-nowrap text-game-accent-300",
            "group-hover/er:text-game-accent-100 group-hover/er:underline group-hover/er:decoration-1 group-hover/er:underline-offset-2",
            s.name,
          )}
        >
          {name}
        </span>
      )}
    </button>
  );
}

const flagSizeByLinkSize: Record<Size, Eu5FlagSize> = {
  xs: "xs",
  sm: "sm",
  md: "base",
};

export function CountryLink({ country, ...props }: SharedProps & { country: CountryRef }) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();
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

  const onActivate = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.altKey) {
      void engine.trigger.removeCountry(country.country.key);
      return;
    }
    nav.pushMany(
      [entityProfileEntry("country", country.country.key, country.country.name)],
      props.backLabel,
    );
    panToEntity(country.anchorLocationIdx);
  };

  return (
    <LinkBody
      {...props}
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
      onActivate={onActivate}
    />
  );
}

export function MarketLink({ market, ...props }: SharedProps & { market: MarketRef }) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();
  const engine = useEu5Engine();

  const onActivate = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.altKey) {
      void engine.trigger.removeMarket(market.market.key);
      return;
    }
    nav.pushMany(
      [entityProfileEntry("market", market.market.key, market.market.name)],
      props.backLabel,
    );
    panToEntity(market.anchorLocationIdx);
  };

  return (
    <LinkBody
      {...props}
      hoverTarget={{ kind: "market", marketId: market.market.key }}
      colorHex={market.colorHex}
      isPlayer={false}
      name={market.market.name}
      onActivate={onActivate}
    />
  );
}
