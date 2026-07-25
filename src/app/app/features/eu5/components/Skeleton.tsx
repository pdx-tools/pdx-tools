import React from "react";
import { cx } from "class-variance-authority";

/**
 * Skeleton — a pulsing placeholder for content that is still loading.
 *
 * Callers supply the footprint (`h-64`, `h-[52px]`, …); the component owns the
 * ground, the radius, and the fact that it is decorative. It is `aria-hidden`
 * because a screen reader gains nothing from an empty box — announce loading
 * state on the region that owns it instead.
 */
export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Skeleton({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        aria-hidden="true"
        className={cx("animate-pulse rounded-panel bg-game-panel-hover", className)}
        {...props}
      />
    );
  },
);
