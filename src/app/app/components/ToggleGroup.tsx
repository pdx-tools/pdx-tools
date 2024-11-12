import React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cx } from "class-variance-authority";

const ToggleGroupRoot = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(function ToggleGroupRoot({ className, ...props }, ref) {
  return (
    <ToggleGroupPrimitive.Root ref={ref} className={className} {...props} />
  );
});

export const ToggleGroup = ToggleGroupRoot as typeof ToggleGroupRoot & {
  Item: typeof ToggleGroupItem;
};

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(function ToggleGroupItem({ className, ...props }, ref) {
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cx(
        "border-r-0 first:rounded-l-md last:rounded-r-md last:border-r focus-visible:z-10 data-[state=on]:bg-sky-100 data-[state=on]:text-sky-800 dark:data-[state=on]:bg-sky-600 dark:data-[state=on]:text-sky-100",
        className,
      )}
      {...props}
    />
  );
});
ToggleGroup.Item = ToggleGroupItem;
