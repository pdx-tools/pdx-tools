import React from "react";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import { cx } from "class-variance-authority";
import { useGameThemeContainer } from "@/components/GameThemeProvider";

/**
 * A menu of actions in the Game world. It has the plate of `GameSelect`, so
 * a menu of actions and a menu of choices look the same. Use `GameSelect`
 * for a value and `GameMenu` for an action.
 */
export const GameMenu = MenuPrimitive.Root as typeof MenuPrimitive.Root & {
  Trigger: typeof MenuPrimitive.Trigger;
  Content: typeof GameMenuContent;
  Item: typeof GameMenuItem;
  Separator: typeof GameMenuSeparator;
};
GameMenu.Trigger = MenuPrimitive.Trigger;

const GameMenuContent = React.forwardRef<
  React.ComponentRef<typeof MenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content>
>(function GameMenuContent({ className, sideOffset = 4, ...props }, ref) {
  const container = useGameThemeContainer();
  return (
    <MenuPrimitive.Portal container={container ?? undefined}>
      <MenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cx(
          "z-1001 min-w-56 overflow-hidden py-1",
          // One surface step lighter than the panel and a soft shadow, so it reads as above the page.
          "rounded-[var(--radius-panel)] border border-solid border-game-line-strong bg-game-panel-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
          "data-[state=open]:animate-enter data-[state=open]:[--tw-enter-opacity:0] data-[state=open]:[--tw-enter-scale:0.95]",
          "data-[state=closed]:animate-exit data-[state=closed]:[--tw-exit-opacity:0] data-[state=closed]:[--tw-exit-scale:0.95]",
          "data-[side=bottom]:[--tw-enter-translate-y:-0.25rem] data-[side=top]:[--tw-enter-translate-y:0.25rem] motion-reduce:!animate-none",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
});
GameMenu.Content = GameMenuContent;

const GameMenuItem = React.forwardRef<
  React.ComponentRef<typeof MenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item>
>(function GameMenuItem({ className, ...props }, ref) {
  return (
    <MenuPrimitive.Item
      ref={ref}
      className={cx(
        "relative flex h-7 cursor-default items-center gap-2 px-2.5 max-md:h-11",
        "font-game-ui text-[12.5px] text-game-ink-300 outline-none select-none",
        "data-highlighted:bg-game-panel-hover data-highlighted:text-game-ink-100",
        "data-disabled:pointer-events-none data-disabled:opacity-40",
        "[&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-game-ink-500",
        className,
      )}
      {...props}
    />
  );
});
GameMenu.Item = GameMenuItem;

const GameMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof MenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>
>(function GameMenuSeparator({ className, ...props }, ref) {
  return (
    <MenuPrimitive.Separator
      ref={ref}
      className={cx("my-1 h-px bg-game-line", className)}
      {...props}
    />
  );
});
GameMenu.Separator = GameMenuSeparator;

/** The quiet note at the end of a menu item, as the mode menu has ("2 views") */
export function GameMenuHint({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto pl-3 font-game-num text-[12px] text-game-ink-500">{children}</span>
  );
}
