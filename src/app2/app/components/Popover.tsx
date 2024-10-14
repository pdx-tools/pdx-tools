import React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cx } from "class-variance-authority";

export const Popover = PopoverPrimitive.Root as typeof PopoverPrimitive.Root & {
  Trigger: typeof PopoverPrimitive.Trigger;
  Content: typeof PopoverContent;
  Arrow: typeof PopoverPrimitive.Arrow;
};

Popover.Arrow = PopoverPrimitive.Arrow;
Popover.Trigger = PopoverPrimitive.Trigger;
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent(
  { className, align = "center", sideOffset = 4, ...props },
  ref,
) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cx(
          "z-[1001] rounded-md bg-white p-4 shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:bg-slate-800",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
Popover.Content = PopoverContent;
