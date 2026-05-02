import React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cx } from "class-variance-authority";

export const GameTabs = TabsPrimitive.Root as typeof TabsPrimitive.Root & {
  List: typeof GameTabsList;
  Trigger: typeof GameTabsTrigger;
  Content: typeof GameTabsContent;
};

const GameTabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function GameTabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cx("flex border-b border-game-line-strong", className)}
      {...props}
    />
  );
});
GameTabs.List = GameTabsList;

interface GameTabsTriggerProps extends React.ComponentPropsWithoutRef<
  typeof TabsPrimitive.Trigger
> {
  count?: number;
}

const GameTabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  GameTabsTriggerProps
>(function GameTabsTrigger({ className, count, children, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cx(
        "relative flex h-8 items-center gap-1 px-3",
        "font-game-ui text-[12.5px] whitespace-nowrap text-game-ink-500",
        "transition-colors hover:text-game-ink-300",
        "data-[state=active]:text-game-ink-100",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
        "after:bg-transparent data-[state=active]:after:bg-game-accent-300",
        "focus-visible:ring-1 focus-visible:ring-game-accent-line focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span className="rounded-[2px] bg-game-panel-2 px-1 font-game-num text-[10px] text-game-ink-500">
          {count}
        </span>
      )}
    </TabsPrimitive.Trigger>
  );
});
GameTabs.Trigger = GameTabsTrigger;

const GameTabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function GameTabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cx(
        "pt-3 focus-visible:ring-1 focus-visible:ring-game-accent-line focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
});
GameTabs.Content = GameTabsContent;
