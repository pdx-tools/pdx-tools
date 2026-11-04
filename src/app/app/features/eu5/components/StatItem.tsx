import React from "react";
import { cx } from "class-variance-authority";
import { sectionLabel } from "@/components/game/SectionTitle";

export interface StatItemProps {
  label: string;
  value: string;
  className?: string;
}

/** A label above a figure, for a header rail. The figure is a Readout, in the mono. */
export function StatItem({ label, value, className }: StatItemProps) {
  return (
    <div className={cx("flex flex-col gap-0.5", className)}>
      <span className={sectionLabel}>{label}</span>
      <span className="font-game-num text-[17px] font-medium text-game-ink-100 tabular-nums">
        {value}
      </span>
    </div>
  );
}
