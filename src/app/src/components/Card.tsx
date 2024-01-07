import { cx } from "class-variance-authority";
import React from "react";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function Card({ className, ...props }, ref) {
  return (
    <div
      className={cx(
        "rounded-lg border border-solid border-gray-400/50 shadow-md",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
