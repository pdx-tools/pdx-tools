import type { ReactNode } from "react";
import { Skeleton } from "../components";
import { Stat } from "../stack/parts";

/**
 * The action of a readout. In a narrow panel it wraps under the figure and
 * its text starts on the figure's edge. In a wide panel its text ends on the
 * edge of the level.
 */
export const readoutAction = "shrink-0 @max-md:px-0 @md:-mr-3";

/*
 * An insight panel's headline as a readout: one figure a reader takes in
 * from across the map, then a ledger line of the figures that qualify it.
 * Panels that share this readout read as one family: this is the one hero stat
 * style of the column, and `Stat` is the one secondary style. It has no fill and
 * no border, because space and size set it apart from the charts.
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
  return (
    <div className="@container">
      <div className="flex flex-col items-start gap-1 @md:flex-row @md:items-baseline @md:justify-between @md:gap-4">
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

export function ReadoutFigure({ value, label }: { value: string; label?: string }) {
  return <Stat value={value} label={label} />;
}
