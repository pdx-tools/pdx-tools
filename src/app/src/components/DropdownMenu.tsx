import React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cx } from "class-variance-authority";

export const DropdownMenu =
  DropdownMenuPrimitive.Root as typeof DropdownMenuPrimitive.Root & {
    Trigger: typeof DropdownMenuPrimitive.Trigger;
    Group: typeof DropdownMenuPrimitive.Group;
    Portal: typeof DropdownMenuPrimitive.Portal;
    Sub: typeof DropdownMenuPrimitive.Sub;
    RadioGroup: typeof DropdownMenuPrimitive.RadioGroup;
    SubTrigger: typeof DropdownMenuSubTrigger;
    SubContent: typeof DropdownMenuSubContent;
    Content: typeof DropdownMenuContent;
    Item: typeof DropdownMenuItem;
    CheckboxItem: typeof DropdownMenuCheckboxItem;
    RadioItem: typeof DropdownMenuRadioItem;
    Label: typeof DropdownMenuLabel;
    Separator: typeof DropdownMenuSeparator;
    Shortcut: typeof DropdownMenuShortcut;
    Arrow: typeof DropdownMenuPrimitive.Arrow;
  };

DropdownMenu.Trigger = DropdownMenuPrimitive.Trigger;
DropdownMenu.Group = DropdownMenuPrimitive.Group;
DropdownMenu.Portal = DropdownMenuPrimitive.Portal;
DropdownMenu.Sub = DropdownMenuPrimitive.Sub;
DropdownMenu.RadioGroup = DropdownMenuPrimitive.RadioGroup;
DropdownMenu.Arrow = DropdownMenuPrimitive.Arrow;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(function DropdownMenuSubTrigger(
  { className, inset, children, ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cx(
        "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-sky-100 data-[state=open]:bg-sky-100",
        inset && "pl-8",
        className,
      )}
      {...props}
    >
      {children}
      {">"}
    </DropdownMenuPrimitive.SubTrigger>
  );
});
DropdownMenu.SubTrigger = DropdownMenuSubTrigger;

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(function DropdownMenuSubContent({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      className={cx(
        "z-50 overflow-hidden rounded-md border p-1 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  );
});
DropdownMenu.SubContent = DropdownMenuSubContent;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cx(
          "z-[1001] overflow-hidden rounded-md border bg-white p-1 shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:border-gray-600 dark:bg-slate-800",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});
DropdownMenu.Content = DropdownMenuContent;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(function DropdownMenuItem({ className, inset, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cx(
        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-sky-100 focus:text-sky-800 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
});
DropdownMenu.Item = DropdownMenuItem;

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(function DropdownMenuCheckboxItem(
  { className, children, checked, ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cx(
        "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-sky-100 focus:text-sky-800 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          ✔️
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
});
DropdownMenu.CheckboxItem = DropdownMenuCheckboxItem;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cx(
        "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-sky-100 focus:text-sky-800 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          🔵
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
});
DropdownMenu.RadioItem = DropdownMenuRadioItem;

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(function DropdownMenuLabel({ className, inset, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cx(
        "px-2 py-1.5 text-sm font-semibold",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
});
DropdownMenu.Label = DropdownMenuLabel;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cx("-mx-1 my-1 h-px bg-gray-400", className)}
      {...props}
    />
  );
});
DropdownMenu.Separator = DropdownMenuSeparator;

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cx("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  );
};
DropdownMenu.Shortcut = DropdownMenuShortcut;
