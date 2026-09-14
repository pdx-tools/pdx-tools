import React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";

/**
 * GameSegmented — a single-choice switch between a few named views of the
 * same data ("Value" / "Units").
 *
 * The frame is the default `GameButton` plate: 28px tall, `panel` ground,
 * `line` edge, `control` radius. Each option is a `Chip` inside it: the chosen
 * one is the committed chip (brass wash, brass hairline, `brass-100` text), the
 * rest are ghost text that step up the ladder on hover. Arrow keys move
 * between options; the ring comes from the shared `focusRing`.
 */
type RootProps = Omit<
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>,
  "type" | "value" | "onValueChange" | "defaultValue"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

const SelectContext = React.createContext<(value: string) => void>(() => {});

const SegmentedRoot = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Root>,
  RootProps
>(function GameSegmented({ className, value, onValueChange, ...props }, ref) {
  return (
    <SelectContext.Provider value={onValueChange}>
      <ToggleGroupPrimitive.Root
        ref={ref}
        type="single"
        value={value}
        // Radix reports an empty string when the pressed option is clicked
        // again; a segmented control always has one option chosen.
        onValueChange={(next) => {
          if (next) onValueChange(next);
        }}
        className={cx(
          "inline-flex h-7 w-fit items-center gap-0.5 rounded-[var(--radius-control)] border border-solid border-game-line bg-game-panel p-0.5",
          className,
        )}
        {...props}
      />
    </SelectContext.Provider>
  );
});

const SegmentedItem = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(function GameSegmentedItem({ className, value, onFocus, ...props }, ref) {
  const select = React.useContext(SelectContext);
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      value={value}
      // The group has radio semantics, so an arrow key chooses as it moves.
      // Focus that arrives from a sibling can only be an arrow key: roving
      // tabindex leaves one option reachable by Tab.
      onFocus={(e) => {
        onFocus?.(e);
        if (e.relatedTarget && e.currentTarget.parentElement?.contains(e.relatedTarget)) {
          select(value);
        }
      }}
      className={cx(
        "inline-flex h-full cursor-pointer items-center rounded-[var(--radius-plate)] border border-solid border-transparent px-2.5 font-game-ui text-[12.5px] leading-none whitespace-nowrap transition-colors duration-100",
        "text-game-ink-300 hover:bg-game-panel-hover hover:text-game-ink-100",
        "data-[state=on]:border-game-accent-line data-[state=on]:bg-game-accent-soft data-[state=on]:font-medium data-[state=on]:text-game-accent-100",
        "disabled:cursor-not-allowed disabled:opacity-40",
        focusRing,
        className,
      )}
      {...props}
    />
  );
});

export const GameSegmented = Object.assign(SegmentedRoot, {
  Item: SegmentedItem,
});
