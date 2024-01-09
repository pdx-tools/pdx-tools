import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, cx, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center font-medium ring-offset-slate-300/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border border-solid bg-sky-600 border-sky-800 text-white enabled:hover:bg-sky-500 focus-visible:bg-sky-500 enabled:active:bg-sky-400",
        default:
          "border border-solid bg-white border-gray-400 text-black/80 enabled:hover:bg-slate-200 focus-visible:bg-slate-200 enabled:active:bg-slate-300",
        danger:
          "border border-solid bg-white border-rose-400 text-rose-800 enabled:hover:bg-rose-200 focus-visible:bg-rose-200 enabled:active:bg-rose-300",
        ghost: "",
      },
      shape: {
        default: "rounded-md px-4 py-2",
        square: "rounded-md p-2",
        circle: "rounded-full p-2",
        none: "",
      },
    },
    defaultVariants: {
      variant: "default",
      shape: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, shape, type, asChild = false, ...props },
    ref,
  ) {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        type={type ?? "button"}
        className={cx(buttonVariants({ variant, shape }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
