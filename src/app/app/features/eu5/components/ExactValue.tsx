import type { ReactNode } from "react";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { Tooltip } from "@/components/Tooltip";

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
  if (exact === undefined) return <>{children}</>;
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <span tabIndex={0} className={cx("rounded-[1px]", focusRing)}>
          {children}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="font-game-num text-xs tabular-nums">
        {exact}
      </Tooltip.Content>
    </Tooltip>
  );
}
