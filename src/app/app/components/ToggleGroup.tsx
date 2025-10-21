import React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cva, cx } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

const ToggleGroupRoot = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(function ToggleGroupRoot({ className, ...props }, ref) {
  return (
    <ToggleGroupPrimitive.Root ref={ref} className={className} {...props} />
  );
});

const toggleGroupItemVariants = cva("focus-visible:z-10", {
  variants: {
    variant: {
      pill: "border-r-0 first:rounded-l-md last:rounded-r-md last:border-r data-[state=on]:bg-sky-100 data-[state=on]:text-sky-800 dark:data-[state=on]:bg-sky-600 dark:data-[state=on]:text-sky-100",
      card: "group flex w-full items-start justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left text-slate-200 transition-all hover:border-sky-400/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 data-[state=on]:border-sky-400/60 data-[state=on]:bg-sky-500/15 data-[state=on]:text-sky-100 data-[state=on]:shadow-sm data-[state=on]:shadow-sky-500/20",
    },
  },
  defaultVariants: {
    variant: "pill",
  },
});

type ToggleGroupItemProps = React.ComponentPropsWithoutRef<
  typeof ToggleGroupPrimitive.Item
> &
  VariantProps<typeof toggleGroupItemVariants>;

const ToggleGroupItem = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Item>,
  ToggleGroupItemProps
>(function ToggleGroupItem({ className, variant = "pill", ...props }, ref) {
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cx(toggleGroupItemVariants({ variant }), className)}
      {...props}
    />
  );
});
export const ToggleGroup = Object.assign(ToggleGroupRoot, {
  Item: ToggleGroupItem,
}) as typeof ToggleGroupRoot & {
  Item: typeof ToggleGroupItem;
};
