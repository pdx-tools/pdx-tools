import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { Tooltip } from "@/components/Tooltip";

/** The row name of a figure in a rail. A rail has one tab stop, and arrow keys go through it. */
export const RailFigureName = createContext<string | undefined>(undefined);

/**
 * A compact figure with its full value in a tooltip, on hover and on keyboard
 * focus. A figure that already is the full value has no tooltip and no tab stop.
 */
export function ExactValue({
  exact,
  children,
}: {
  exact: string | undefined;
  children: ReactNode;
}) {
  const railName = useContext(RailFigureName);
  if (exact === undefined) return <>{children}</>;
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <span
          tabIndex={railName ? -1 : 0}
          data-rail-value={railName ? "" : undefined}
          aria-label={railName ? `${railName}: ${exact}` : undefined}
          className={cx("rounded-[1px]", focusRing)}
        >
          {children}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="font-game-num text-xs tabular-nums">
        {exact}
      </Tooltip.Content>
    </Tooltip>
  );
}
