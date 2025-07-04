import React from "react";
import { cva, type VariantProps, cx } from "class-variance-authority";

const badge = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        green:
          "bg-green-100 border-1 border-solid border-green-200 dark:bg-green-800 dark:border-green-700 dark:text-white",
        blue: "bg-sky-100 border-1 border-solid border-sky-200 dark:bg-sky-800 dark:border-sky-700 dark:text-white",
        default:
          "bg-gray-100 border-1 border-solid border-gray-200 dark:bg-gray-700 dark:border-gray-600 dark:text-white",
        gold: "bg-amber-100 border-1 border-solid border-amber-200 dark:bg-amber-800 dark:border-amber-700 dark:text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cx(badge({ variant }), className)} {...props} />;
}
