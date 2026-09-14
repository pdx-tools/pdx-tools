import React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cx } from "class-variance-authority";
import { createPortal } from "react-dom";
import { useGameThemeContainer } from "@/components/GameThemeProvider";

export const Tooltip = TooltipPrimitive.Root as typeof TooltipPrimitive.Root & {
  Provider: typeof TooltipPrimitive.Provider;
  Trigger: typeof TooltipTrigger;
  Content: typeof TooltipContent;
};

Tooltip.Provider = TooltipPrimitive.Provider;

const TooltipTrigger = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(function TooltipTrigger({ className, asChild, ...props }, ref) {
  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      className={cx(!asChild && "border-0 bg-transparent p-0", className)}
      asChild={asChild}
      {...props}
    />
  );
});
Tooltip.Trigger = TooltipTrigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 4, ...props }, ref) {
  const container = useGameThemeContainer();

  if (!("document" in globalThis)) {
    return null;
  }

  // https://github.com/radix-ui/primitives/issues/3143
  return createPortal(
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cx(
        "z-1100 overflow-hidden rounded-md border bg-slate-900/90 px-3 py-1.5 text-sm text-gray-100 shadow-md data-[side=bottom]:[--tw-enter-translate-y:-0.5rem] data-[side=left]:[--tw-enter-translate-x:0.5rem] data-[side=right]:[--tw-enter-translate-x:-0.5rem] data-[side=top]:[--tw-enter-translate-y:0.5rem] data-[state=closed]:animate-exit data-[state=closed]:[--tw-exit-opacity:0] data-[state=closed]:[--tw-exit-scale:0.95] data-[state=open]:animate-enter data-[state=open]:[--tw-enter-opacity:0] data-[state=open]:[--tw-enter-scale:0.95] motion-reduce:!animate-none dark:border-gray-600",
        className,
      )}
      {...props}
    />,
    container ?? document.body,
  );
});
Tooltip.Content = TooltipContent;
