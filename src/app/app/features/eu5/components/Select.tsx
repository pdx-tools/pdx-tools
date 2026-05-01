import React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { cx } from "class-variance-authority";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useGameThemeContainer } from "@/components/GameThemeProvider";

export const GameSelect = SelectPrimitive.Root as typeof SelectPrimitive.Root & {
  Group: typeof SelectPrimitive.Group;
  Value: typeof SelectPrimitive.Value;
  Trigger: typeof GameSelectTrigger;
  Content: typeof GameSelectContent;
  Label: typeof GameSelectLabel;
  Item: typeof GameSelectItem;
  Separator: typeof GameSelectSeparator;
};
GameSelect.Group = SelectPrimitive.Group;
GameSelect.Value = SelectPrimitive.Value;

const GameSelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function GameSelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cx(
        "flex h-7 w-full items-center justify-between gap-1.5 rounded-[var(--radius-control)]",
        "border border-solid border-game-line bg-game-page px-2.5",
        "font-game-ui text-[12.5px] text-game-ink-100",
        "focus:ring-1 focus:ring-game-accent-line focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "data-[placeholder]:text-game-ink-500",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-game-ink-500" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
GameSelect.Trigger = GameSelectTrigger;

const GameSelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function GameSelectContent({ className, children, position = "popper", ...props }, ref) {
  const container = useGameThemeContainer();

  return (
    <SelectPrimitive.Portal container={container ?? undefined}>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cx(
          "relative z-[1001] min-w-24 overflow-hidden",
          "rounded-[var(--radius-panel)] border border-solid border-game-line-strong bg-game-panel py-1 shadow-lg",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport
          className={cx(
            "flex flex-col",
            position === "popper" &&
              "h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
GameSelect.Content = GameSelectContent;

const GameSelectLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function GameSelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cx(
        "px-2.5 py-1 font-game-ui text-[10px] tracking-wider text-game-ink-500 uppercase",
        className,
      )}
      {...props}
    />
  );
});
GameSelect.Label = GameSelectLabel;

const GameSelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function GameSelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cx(
        "relative flex h-7 cursor-default items-center gap-1.5 rounded-[2px] px-2.5 pr-7",
        "font-game-ui text-[12.5px] text-game-ink-300 outline-none select-none",
        "data-[highlighted]:bg-game-panel-hover data-[highlighted]:text-game-ink-100",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="h-3.5 w-3.5 text-game-accent-300" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
});
GameSelect.Item = GameSelectItem;

const GameSelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function GameSelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cx("my-1 h-px bg-game-line", className)}
      {...props}
    />
  );
});
GameSelect.Separator = GameSelectSeparator;
