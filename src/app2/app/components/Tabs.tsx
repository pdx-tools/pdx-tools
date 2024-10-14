import React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cx } from "class-variance-authority";

export const Tabs = TabsPrimitive.Root as typeof TabsPrimitive.Root & {
  List: typeof TabsList;
  Trigger: typeof TabsTrigger;
  Content: typeof TabsContent;
};

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cx(
        "inline-flex rounded-md p-1 sm:items-center sm:justify-center",
        className,
      )}
      {...props}
    />
  );
});
Tabs.List = TabsList;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cx(
        "inline-flex items-center justify-center whitespace-nowrap border-0 border-solid bg-white px-3 py-1.5 text-sm font-medium ring-offset-2 transition-all hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-b data-[state=active]:text-sky-800 data-[state=active]:shadow-sm dark:bg-slate-700 dark:hover:bg-sky-700 dark:data-[state=active]:text-sky-300",
        className,
      )}
      {...props}
    />
  );
});
Tabs.Trigger = TabsTrigger;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cx(
        "max-h-full max-w-full overflow-y-auto ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    />
  );
});
Tabs.Content = TabsContent;
