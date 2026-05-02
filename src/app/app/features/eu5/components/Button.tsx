import React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { cva, cx } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  [
    "inline-flex cursor-pointer items-center justify-center gap-1.5",
    "rounded-[var(--radius-control)] font-game-ui text-[12.5px] leading-none",
    "border border-solid transition-colors",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-game-accent-line",
    "disabled:opacity-40 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        commit:
          "h-7 px-3 bg-game-accent-300 border-game-accent-500 text-game-panel font-medium enabled:hover:bg-game-accent-500",
        default:
          "h-7 px-3 bg-game-panel border-game-line text-game-ink-100 enabled:hover:bg-game-panel-hover enabled:hover:border-game-line-strong",
        ghost:
          "h-7 px-3 bg-transparent border-transparent text-game-ink-300 enabled:hover:text-game-ink-100 enabled:hover:bg-game-panel-hover",
        icon: "h-7 w-7 bg-transparent border-transparent text-game-ink-500 enabled:hover:text-game-ink-100 enabled:hover:bg-game-panel-hover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface GameButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const GameButton = React.forwardRef<HTMLButtonElement, GameButtonProps>(function GameButton(
  { className, variant, type, asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? SlotPrimitive.Slot : "button";
  return (
    <Comp
      type={type ?? "button"}
      className={cx(buttonVariants({ variant }), className)}
      ref={ref}
      {...props}
    />
  );
});
