import type { ReactNode } from "react";
import { cx } from "class-variance-authority";
import { sectionLabel } from "@/components/game/SectionTitle";

export interface StatItemProps {
  label: string;
  value: ReactNode;
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
 * the figure to carry (17px), a grid of plates wants it to sit level with its
 * neighbours (14px). The figure is in the number font at each density.
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
      <span className={sectionLabel}>{label}</span>
      <span
        className={cx(
          "font-game-num font-medium text-game-ink-100 tabular-nums",
          boxed ? "text-sm" : "text-[17px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}
