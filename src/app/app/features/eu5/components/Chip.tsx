import React from "react";
import { cva, cx } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--radius-plate)] border border-solid px-2 py-0.5 font-game-ui text-[11px] leading-none",
  {
    variants: {
      variant: {
        default: "bg-game-panel-2 border-game-line text-game-ink-300",
        committed: "bg-game-accent-soft border-game-accent-line text-game-accent-100",
        good: "bg-game-panel-2 border-game-line text-game-good",
        warn: "bg-game-panel-2 border-game-line text-game-warn",
        error: "bg-game-panel-2 border-game-line text-game-err",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type DotProp = boolean | string;

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof chipVariants> {
  dot?: DotProp;
}

export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  { className, variant, dot, children, ...props },
  ref,
) {
  const dotStyle = typeof dot === "string" ? { background: dot } : undefined;
  const dotClass =
    variant === "committed"
      ? "w-1.5 h-1.5 rounded-full bg-game-accent-300 shrink-0"
      : "w-1.5 h-1.5 rounded-full bg-current shrink-0";

  return (
    <span ref={ref} className={cx(chipVariants({ variant }), className)} {...props}>
      {dot && <span className={dotClass} style={dotStyle} aria-hidden />}
      {children}
    </span>
  );
});
