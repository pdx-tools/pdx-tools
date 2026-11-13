import type { ReactNode } from "react";
import { usePanelNav } from "./profiles/PanelNavContext";
import { Skeleton } from "../components";

/*
 * An insight panel's headline as a readout: one figure a reader takes in
 * from across the map, then a ledger line of the figures that qualify it.
 * Panels that share this readout read as one family. It has no fill and no
 * border, because space and size set it apart from the charts.
 */

export function InsightReadoutSkeleton() {
  return <Skeleton className="mb-0 h-12" />;
}

export function InsightReadout({
  figure,
  unit,
  action,
  children,
}: {
  figure: ReactNode;
  unit: string;
  /** An optional control on the headline row, such as a hand-off to a sibling panel. */
  action?: ReactNode;
  /** The ledger figures. */
  children: ReactNode;
}) {
  const nav = usePanelNav();
  if (nav.stack.length > 0) return null;

  return (
    <div className="pb-2">
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
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 leading-none">{children}</div>
    </div>
  );
}

/** A figure in the ledger, with its label in the text font */
export function ReadoutFigure({ value, label }: { value: ReactNode; label?: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="font-game-num text-[12px] font-medium text-game-ink-100 tabular-nums">
        {value}
      </span>
      {label ? <span className="font-game-ui text-[12px] text-game-ink-300">{label}</span> : null}
    </span>
  );
}
