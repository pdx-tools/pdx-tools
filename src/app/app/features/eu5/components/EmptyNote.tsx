import React from "react";
import { cx } from "class-variance-authority";

/**
 * EmptyNote — an inline note standing in for a single chart or table whose data
 * is absent, inside a panel that otherwise has plenty to show.
 *
 * Subordinate to `Eu5InsightEmptyState`, which owns the case where the whole
 * panel is empty and can afford a 180px plate with an eyebrow and a recovery
 * hint. Here the panel is already bounded, so this stays a single bordered line
 * of text — a second full plate nested inside the first would read as a card in
 * a card.
 */
export const EmptyNote = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function EmptyNote({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cx(
        "rounded-panel border border-game-line bg-game-panel-hover px-3 py-6 text-center text-sm text-game-ink-500",
        className,
      )}
      {...props}
    />
  );
});
