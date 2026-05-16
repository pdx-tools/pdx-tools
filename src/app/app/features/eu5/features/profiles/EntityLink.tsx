import type React from "react";
import { cx } from "class-variance-authority";
import type { EntityRef } from "@/wasm/wasm_eu5";
import { usePanelNav, entityProfileEntry } from "./PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { useEu5Engine } from "../../store";
import { useEu5MapHoverTarget } from "../../useEu5MapHoverTarget";

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

type EntityLinkProps = {
  entity: EntityRef;
  size?: keyof typeof sizeClasses;
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

export function EntityLink(props: EntityLinkProps) {
  const { entity, size = "sm", aligned = false, className, children } = props;
  const s = sizeClasses[size];

  const tag = entity.kind === "country" && (
    <span
      className={cx(
        "shrink-0 font-game-num tracking-[0.06em] text-game-ink-500",
        aligned && "min-w-[calc(5ch+0.3em)]",
        s.tag,
      )}
    >
      {entity.tag}
    </span>
  );
  const isPlayer = entity.kind === "country" ? entity.isPlayer : false;
  const hoverProps = useEu5MapHoverTarget(
    entity.kind === "country"
      ? { kind: "country", countryIdx: entity.countryIdx }
      : { kind: "market", marketId: entity.marketId },
  );

  if (props.static) {
    return (
      <span
        {...hoverProps}
        className={cx("inline-flex max-w-full min-w-0 items-center", s.wrapper, className)}
      >
        <EntitySwatch colorHex={entity.colorHex} isPlayer={isPlayer} className={s.swatch} />
        {tag}
        {children ?? (
          <span
            className={cx(
              "min-w-0 flex-[0_1_auto] overflow-hidden font-medium text-ellipsis whitespace-nowrap text-game-ink-100",
              s.name,
            )}
          >
            {entity.name}
          </span>
        )}
      </span>
    );
  }

  return <EntityLinkButton {...props} s={s} tag={tag} hoverProps={hoverProps} />;
}

function EntityLinkButton({
  entity,
  backLabel,
  className,
  children,
  s,
  tag,
  hoverProps,
}: EntityLinkProps & {
  s: (typeof sizeClasses)[keyof typeof sizeClasses];
  tag: React.ReactNode;
  hoverProps: ReturnType<typeof useEu5MapHoverTarget>;
}) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();
  const engine = useEu5Engine();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const typedId = entity.kind === "country" ? entity.countryIdx : entity.marketId;
    if (event.altKey) {
      void (entity.kind === "country"
        ? engine.trigger.removeCountry(typedId)
        : engine.trigger.removeMarket(typedId));
      return;
    }

    console.log(entityProfileEntry(entity.kind, typedId, entity.name));
    nav.pushMany([entityProfileEntry(entity.kind, typedId, entity.name)], backLabel);
    panToEntity(entity.anchorLocationIdx);
  };

  const isPlayer = entity.kind === "country" ? entity.isPlayer : false;

  return (
    <button
      type="button"
      onClick={handleClick}
      {...hoverProps}
      className={cx(
        "group/er inline-flex max-w-full min-w-0 cursor-pointer items-center border-0 bg-transparent p-0 text-left align-middle",
        s.wrapper,
        className,
      )}
    >
      <EntitySwatch colorHex={entity.colorHex} isPlayer={isPlayer} className={s.swatch} />
      {tag}
      {children ?? (
        <span
          className={cx(
            "min-w-0 flex-[0_1_auto] overflow-hidden font-medium text-ellipsis whitespace-nowrap text-game-accent-300",
            "group-hover/er:text-game-accent-100 group-hover/er:underline group-hover/er:decoration-1 group-hover/er:underline-offset-2",
            s.name,
          )}
        >
          {entity.name}
        </span>
      )}
    </button>
  );
}
