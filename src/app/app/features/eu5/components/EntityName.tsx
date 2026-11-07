import type React from "react";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { Tooltip } from "@/components/Tooltip";

export const entityLinkControl = cx("group/entity-link focus-visible:rounded-[1px]", focusRing);

/**
 * A term with an explanation in a tooltip. It has a small "?" mark and no underline,
 * so an underline means a link and nothing else. The text keeps its colour.
 */
const glossaryTerm =
  "cursor-help after:ml-1 after:inline-block after:h-3 after:w-3 after:rounded-full after:border after:border-game-ink-500 after:text-center after:align-[1px] after:font-game-ui after:text-[9px] after:leading-[10px] after:font-medium after:tracking-normal after:text-game-ink-300 after:content-['?'] hover:after:border-game-ink-100 hover:after:text-game-ink-100";

/** The terms that this tool defines. The game has no name for them. */
const DEFINED_TERMS: Record<string, string> = {
  "Tax Gap":
    "Tax Base Gap: wealth less tax base. It is the tax base that low control does not realize.",
  "Eff. Dev": "Effective Development: control × development.",
};

const definitionOf = (label: string | undefined) =>
  Object.entries(DEFINED_TERMS).find(([term]) => label?.endsWith(term))?.[1];

/** The small mark of a label that names a defined term */
export const definedTermMark = (label: string | undefined) =>
  definitionOf(label) ? glossaryTerm : undefined;

/**
 * Shows the definition on hover and on focus of `children`, if the label names a
 * defined term. The child must take focus itself, because a browser does not move
 * focus to an element inside a button.
 */
export function DefinedTerm({
  label,
  children,
}: {
  label: string | undefined;
  children: React.ReactElement;
}) {
  const definition = definitionOf(label);
  if (!definition) return children;
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Content side="top" className="max-w-72 text-xs normal-case">
        {definition}
      </Tooltip.Content>
    </Tooltip>
  );
}

export function EntityName({ className, ...props }: React.ComponentPropsWithoutRef<"span">) {
  return (
    <span
      {...props}
      className={cx(
        "text-game-ink-100 underline decoration-game-ink-rule decoration-solid decoration-1 underline-offset-2",
        "group-hover/entity-link:decoration-game-ink-100 group-focus-visible/entity-link:decoration-game-ink-100",
        className,
      )}
    />
  );
}
