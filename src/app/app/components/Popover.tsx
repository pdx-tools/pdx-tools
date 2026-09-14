import React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cx } from "class-variance-authority";
import { useGameThemeContainer } from "@/components/GameThemeProvider";

export const Popover = PopoverPrimitive.Root as typeof PopoverPrimitive.Root & {
  Trigger: typeof PopoverPrimitive.Trigger;
  Content: typeof PopoverContent;
  Arrow: typeof PopoverPrimitive.Arrow;
};

Popover.Arrow = PopoverPrimitive.Arrow;
Popover.Trigger = PopoverPrimitive.Trigger;
const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, align = "center", sideOffset = 4, ...props }, ref) {
  const container = useGameThemeContainer();

  return (
    <PopoverPrimitive.Portal container={container ?? undefined}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cx(
          "z-1001 outline-none data-[side=bottom]:[--tw-enter-translate-y:-0.5rem] data-[side=left]:[--tw-enter-translate-x:0.5rem] data-[side=right]:[--tw-enter-translate-x:-0.5rem] data-[side=top]:[--tw-enter-translate-y:0.5rem] data-[state=closed]:animate-exit data-[state=closed]:[--tw-exit-opacity:0] data-[state=closed]:[--tw-exit-scale:0.95] data-[state=open]:animate-enter data-[state=open]:[--tw-enter-opacity:0] data-[state=open]:[--tw-enter-scale:0.95] motion-reduce:!animate-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
Popover.Content = PopoverContent;
