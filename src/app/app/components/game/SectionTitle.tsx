import React from "react";
import { cx } from "class-variance-authority";

/**
 * The Label step of the type scale: the number font, medium, `ink-500`,
 * uppercase. Each game sets the size and tracking. One string so every
 * section label in the Game world is the same label.
 */
export const sectionLabel = "font-game-num text-game-label font-medium text-game-ink-500 uppercase";

/**
 * SectionTitle — the uppercase heading above a chart or block inside an
 * insight or profile panel.
 *
 * The same mono label that `StatRail.Section` uses to divide a rail. The
 * panel content changes voice from section to section (a question, a table
 * name, a good's name); the label above it does not.
 */
export const SectionTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function SectionTitle({ className, ...props }, ref) {
  return <p ref={ref} className={cx("mb-2", sectionLabel, className)} {...props} />;
});
