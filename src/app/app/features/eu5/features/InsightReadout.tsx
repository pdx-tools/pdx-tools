import type { ReactNode } from "react";
import { usePanelNav } from "./profiles/PanelNavContext";
import { Skeleton } from "../components";

/*
 * An insight panel's headline as a readout: one figure a reader takes in
 * from across the map, then a ledger line of the figures that qualify it.
 * Panels that share this card read as one family.
 */

export function InsightReadoutSkeleton() {
  return <Skeleton className="mb-0 h-[66px]" />;
}

export function InsightReadout({
  figure,
  unit,
  action,
  children,
}: {
  figure: string;
  unit: string;
  /** An optional control on the headline row, such as a hand-off to a sibling panel. */
  action?: ReactNode;
  /** The ledger figures. */
  children: ReactNode;
}) {
  const nav = usePanelNav();
  if (nav.stack.length > 0) return null;

  return (
    <div className="rounded-panel border border-game-line-strong bg-game-panel-hover px-4 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className="font-game-num text-[20px] font-medium text-game-ink-100 tabular-nums">
            {figure}
          </span>
          <span className="font-game-ui text-[12.5px] whitespace-nowrap text-game-ink-300">
            {unit}
          </span>
        </div>
        {action}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-game-num text-[12px] leading-none text-game-ink-500 tabular-nums">
        {children}
      </div>
    </div>
  );
}

export function ReadoutFigure({ value, label }: { value: string; label?: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-game-ink-100">{value}</span>
      {label ? ` ${label}` : null}
    </span>
  );
}
