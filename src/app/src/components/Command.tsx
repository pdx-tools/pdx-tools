import React from "react";
import { DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Dialog } from "@/components/Dialog";
import { cx } from "class-variance-authority";
import styles from "./Command.module.css";

const CommandRoot = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(function Command({ className, ...props }, ref) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cx(
        "flex h-full w-full flex-col overflow-hidden rounded-md bg-white dark:bg-slate-800",
        className,
      )}
      {...props}
    />
  );
});

export const Command = CommandRoot as typeof CommandRoot & {
  Dialog: typeof CommandDialog;
  Input: typeof CommandInput;
  List: typeof CommandList;
  Empty: typeof CommandEmpty;
  Group: typeof CommandGroup;
  Item: typeof CommandItem;
  Shortcut: typeof CommandShortcut;
  Separator: typeof CommandSeparator;
};

interface CommandDialogProps extends DialogProps {}

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
  return (
    <Dialog {...props}>
      <Dialog.Content className="overflow-hidden p-0 shadow-lg">
        <Command className={styles["dialog"]}>{children}</Command>
      </Dialog.Content>
    </Dialog>
  );
};
Command.Dialog = CommandDialog;

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(function CommandInput({ className, ...props }, ref) {
  return (
    <div
      className="flex items-center border-b px-3 dark:border-gray-600"
      cmdk-input-wrapper=""
    >
      <MagnifyingGlassIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        ref={ref}
        className={cx(
          "flex h-11 w-full rounded-md bg-white px-2 py-3 text-sm outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800",
          className,
        )}
        {...props}
      />
    </div>
  );
});
Command.Input = CommandInput;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(function CommandList({ className, ...props }, ref) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cx(
        "max-h-[300px] overflow-y-auto overflow-x-hidden",
        className,
      )}
      {...props}
    />
  );
});
Command.List = CommandList;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(function CommandEmpty(props, ref) {
  return (
    <CommandPrimitive.Empty
      ref={ref}
      className="py-6 text-center text-sm"
      {...props}
    />
  );
});
Command.Empty = CommandEmpty;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(function CommandGroup({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cx("overflow-hidden p-1", styles["heading"], className)}
      {...props}
    />
  );
});
Command.Group = CommandGroup;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(function CommandSeparator({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Separator
      ref={ref}
      className={cx("-mx-1 h-px", className)}
      {...props}
    />
  );
});
Command.Separator = CommandSeparator;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(function CommandItem({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cx(
        "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-selected:bg-sky-100 aria-selected:text-sky-800",
        className,
      )}
      {...props}
    />
  );
});
Command.Item = CommandItem;

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cx("ml-auto text-xs tracking-widest text-gray-400", className)}
      {...props}
    />
  );
};
Command.Shortcut = CommandShortcut;
