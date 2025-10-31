import React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { cx } from "class-variance-authority";
import { ChevronDownIcon } from "@heroicons/react/24/solid";

export const Collapsible =
  CollapsiblePrimitive.Root as typeof CollapsiblePrimitive.Root & {
    Trigger: typeof CollapsibleTrigger;
    Content: typeof CollapsibleContent;
  };
Collapsible.Trigger = CollapsiblePrimitive.Trigger;
Collapsible.Content = CollapsiblePrimitive.Content;

const CollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger> & {
    showChevron?: boolean;
  }
>(function CollapsibleTrigger(
  { className, children, showChevron = true, ...props },
  ref,
) {
  return (
    <CollapsiblePrimitive.Trigger
      ref={ref}
      className={cx(
        "group flex w-full items-center justify-between text-sm font-medium transition-colors",
        className,
      )}
      {...props}
    >
      {children}
      {showChevron && (
        <ChevronDownIcon className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      )}
    </CollapsiblePrimitive.Trigger>
  );
});
Collapsible.Trigger = CollapsibleTrigger;

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(function CollapsibleContent({ className, children, ...props }, ref) {
  return (
    <CollapsiblePrimitive.Content
      ref={ref}
      className={cx(
        "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden transition-all",
        className,
      )}
      {...props}
    >
      {children}
    </CollapsiblePrimitive.Content>
  );
});
Collapsible.Content = CollapsibleContent;
