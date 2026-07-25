import React from "react";
import { cx } from "class-variance-authority";

/**
 * SectionTitle — the uppercase heading above a chart or block inside an
 * insight or profile panel.
 *
 * Deliberately set in the UI sans, not the mono used by `StatRail.Section` and
 * `SidebarNav.Section`. Those label data and belong to the numeric voice; this
 * one heads a section of prose-titled content ("How has the price moved?") and
 * would read as costume in mono.
 */
export const SectionTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function SectionTitle({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cx(
        "mb-2 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase",
        className,
      )}
      {...props}
    />
  );
});
