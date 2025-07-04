import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cx } from "class-variance-authority";
import { createPortal } from "react-dom";

export const Tooltip = TooltipPrimitive.Root as typeof TooltipPrimitive.Root & {
  Provider: typeof TooltipPrimitive.Provider;
  Trigger: typeof TooltipTrigger;
  Content: typeof TooltipContent;
};

Tooltip.Provider = TooltipPrimitive.Provider;

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
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
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 4, ...props }, ref) {
  if (!("document" in globalThis)) {
    return null;
  }

  // https://github.com/radix-ui/primitives/issues/3143
  return createPortal(
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cx(
        "z-50 overflow-hidden rounded-md border bg-slate-900/90 px-3 py-1.5 text-sm text-gray-100 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:border-gray-600",
        className,
      )}
      {...props}
    />,
    document.body,
  );
});
Tooltip.Content = TooltipContent;
