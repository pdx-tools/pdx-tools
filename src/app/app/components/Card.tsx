import { VariantProps, cva, cx } from "class-variance-authority";
import React from "react";

const cardVariants = cva(
  "rounded-lg border border-solid border-gray-400/50 shadow-md",
  {
    variants: {
      variant: {
        default: "dark:bg-slate-800",
        ghost: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>
>(function Card({ className, variant, ...props }, ref) {
  return (
    <div
      className={cx(cardVariants({ variant }), className)}
      ref={ref}
      {...props}
    />
  );
});
