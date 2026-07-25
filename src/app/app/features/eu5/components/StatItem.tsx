import React from "react";
import { cx } from "class-variance-authority";

export interface StatItemProps {
  label: string;
  value: string;
  /**
   * Draw the stat on its own bounded plate. Use inside a grid of peers, where
   * the border is what separates one figure from the next. Leave it off in a
   * header rail, where the surrounding panel already provides the bound.
   */
  boxed?: boolean;
  className?: string;
}

/**
 * StatItem — a label above a figure, the smallest unit of the EU5 read-out.
 *
 * Boxed and unboxed are the same stat at two densities: the header rail wants
 * the figure to carry (18px bold), a grid of plates wants it to sit level with
 * its neighbours (14px semibold).
 */
export function StatItem({ label, value, boxed, className }: StatItemProps) {
  return (
    <div
      className={cx(
        "flex flex-col gap-0.5",
        boxed && "rounded-panel border border-game-line bg-game-panel-hover px-3 py-2",
        className,
      )}
    >
      <span className="text-[10px] font-semibold tracking-wider text-game-ink-300 uppercase">
        {label}
      </span>
      <span
        className={cx("text-game-ink-100", boxed ? "text-sm font-semibold" : "text-lg font-bold")}
      >
        {value}
      </span>
    </div>
  );
}
