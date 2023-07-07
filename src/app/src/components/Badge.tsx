import React from "react";
import { cva, type VariantProps, cx } from "class-variance-authority";

const badge = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        green: "bg-green-100 border-1 border-solid border-green-200",
        blue: "bg-sky-100 border-1 border-solid border-sky-200",
        default: "bg-gray-100 border-1 border-solid border-gray-200",
        gold: "bg-amber-100 border-1 border-solid border-amber-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cx(badge({ variant }), className)} {...props} />;
}
