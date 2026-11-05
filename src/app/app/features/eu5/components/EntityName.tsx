import type React from "react";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { Tooltip } from "@/components/Tooltip";

export const entityLinkControl = cx(
  "group/entity-link relative focus-visible:rounded-[1px]",
  // A table row on a phone is 44px, and the link takes a tap on its full height.
  "max-md:before:absolute max-md:before:inset-x-0 max-md:before:-inset-y-3.5",
  focusRing,
);

/**
 * A term with an explanation in a tooltip. It has a small "?" mark and no underline,
 * so an underline means a link and nothing else. The text keeps its colour.
 */
export const glossaryTerm =
  "cursor-help after:ml-1 after:inline-block after:h-3 after:w-3 after:rounded-full after:border after:border-game-ink-500 after:text-center after:align-[1px] after:font-game-ui after:text-[9px] after:leading-[10px] after:font-medium after:tracking-normal after:text-game-ink-300 after:content-['?'] hover:after:border-game-ink-100 hover:after:text-game-ink-100";

/** The terms that this tool defines. The game has no name for them. */
const DEFINED_TERMS: Record<string, string> = {
  "Tax Gap":
    "Tax Base Gap: wealth less tax base. It is the tax base that low control does not realize.",
  "Eff. Dev": "Effective Development: control × development.",
  Score: "Great power score: the points that set the game's great power rank.",
  Value: "Market value: the price of each good times the amount traded, summed over its goods.",
};

/** A label with its dotted underline and its tooltip, if the label names a defined term */
export function DefinedTerm({ label }: { label: string }) {
  const term = Object.keys(DEFINED_TERMS).find((x) => label.endsWith(x));
  if (!term) return <>{label}</>;
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <span tabIndex={0} className={cx(glossaryTerm, "rounded-[1px]", focusRing)}>
          {label}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content side="right" className="max-w-72 text-xs normal-case">
        {DEFINED_TERMS[term]}
      </Tooltip.Content>
    </Tooltip>
  );
}

/**
 * A jump to another entity: bright ink with a solid underline. In a dense table
 * each row has such names, and the underlines read as noise, so the underline
 * shows only with the row's hover and gets bright on the link's hover or focus.
 */
export function EntityName({ className, ...props }: React.ComponentPropsWithoutRef<"span">) {
  return (
    <span
      {...props}
      className={cx(
        "text-game-ink-100 underline decoration-game-ink-rule decoration-solid decoration-1 underline-offset-2",
        "group-hover/entity-link:decoration-game-ink-100 group-focus-visible/entity-link:decoration-game-ink-100",
        "in-[table]:decoration-transparent in-[table]:in-[tr:hover]:decoration-game-ink-rule",
        "in-[table]:group-hover/entity-link:decoration-game-ink-100 in-[table]:group-focus-visible/entity-link:decoration-game-ink-100",
        className,
      )}
    />
  );
}
