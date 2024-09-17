import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cx } from "class-variance-authority";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import styles from "./Accordion.module.css";

export const Accordion =
  AccordionPrimitive.Root as typeof AccordionPrimitive.Root & {
    Item: typeof AccordionItem;
    Trigger: typeof AccordionTrigger;
    Content: typeof AccordionContent;
    Header: typeof AccordionPrimitive.Header;
  };

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={cx("border-b", className)}
      {...props}
    />
  );
});
Accordion.Item = AccordionItem;

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AccordionTrigger({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cx(
        "flex flex-1 items-center py-4 font-medium transition-all",
        styles["accordion"],
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="h-4 w-4 shrink-0 transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  );
});
Accordion.Trigger = AccordionTrigger;

Accordion.Header = AccordionPrimitive.Header;

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cx("pb-4 pt-0", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
});
Accordion.Content = AccordionContent;
