import React from "react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { VariantProps, cva, cx } from "class-variance-authority";

const NavigationMenuRoot = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root>
>(function NavigationMenuRoot({ className, children, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Root
      ref={ref}
      className={cx(
        "relative z-[1] flex max-w-max flex-1 items-center justify-center",
        className,
      )}
      {...props}
    >
      {children}
    </NavigationMenuPrimitive.Root>
  );
});

export const NavigationMenu =
  NavigationMenuRoot as typeof NavigationMenuRoot & {
    List: typeof NavigationMenuList;
    Item: typeof NavigationMenuPrimitive.Item;
    Trigger: typeof NavigationMenuTrigger;
    Content: typeof NavigationMenuContent;
    Link: typeof NavigationMenuLink;
    Indicator: typeof NavigationMenuIndicator;
    Viewport: typeof NavigationMenuViewport;
  };

NavigationMenu.Item = NavigationMenuPrimitive.Item;

const NavigationMenuList = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(function NavigationMenuList({ className, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.List
      ref={ref}
      className={cx(
        "group m-0 flex flex-1 list-none items-center justify-center space-x-1 p-0",
        className,
      )}
      {...props}
    />
  );
});

NavigationMenu.List = NavigationMenuList;

const navigationMenuTriggerStyle = cva(
  "group inline-flex w-full border-0 items-center justify-start text-white bg-slate-900 text-sm font-medium transition-colors hover:bg-sky-800 hover:text-gray-300 focus:bg-sky-800 focus:text-gray-300 focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-sky-800/50 data-[state=open]:bg-sky-800/50",
  {
    variants: {
      variant: {
        default: "",
        button: "px-4 py-2 cursor-pointer",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const NavigationMenuTrigger = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(function NavigationMenuTrigger({ className, children, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Trigger
      ref={ref}
      className={cx(navigationMenuTriggerStyle(), "group", className)}
      {...props}
    >
      {children}
      {/* <DownOutlined
    width={4}
    height={4}
      className="relative top-[1px] ml-2 h-3 w-3 transition duration-200 group-data-[state=open]:rotate-180"
      aria-hidden="true"
    /> */}
    </NavigationMenuPrimitive.Trigger>
  );
});
NavigationMenu.Trigger = NavigationMenuTrigger;

const NavigationMenuContent = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(function NavigationMenuContent({ className, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Content
      ref={ref}
      className={cx(
        "top-0 w-full data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 md:absolute md:w-auto",
        className,
      )}
      {...props}
    />
  );
});
NavigationMenu.Content = NavigationMenuContent;

interface NavigationMenuLinkProps
  extends React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Link>,
    VariantProps<typeof navigationMenuTriggerStyle> {}

const NavigationMenuLink = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Link>,
  NavigationMenuLinkProps
>(function NavigationMenuLink({ className, variant, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Link
      ref={ref}
      className={cx(navigationMenuTriggerStyle({ variant }), className)}
      {...props}
    />
  );
});
NavigationMenu.Link = NavigationMenuLink;

const NavigationMenuViewport = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Viewport>
>(function NavigationMenuViewport({ className, ...props }, ref) {
  return (
    <div className={cx("absolute top-full flex justify-center", className)}>
      <NavigationMenuPrimitive.Viewport
        className="bg-popover text-popover-foreground relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 md:w-[var(--radix-navigation-menu-viewport-width)]"
        ref={ref}
        {...props}
      />
    </div>
  );
});
NavigationMenu.Viewport = NavigationMenuViewport;

const NavigationMenuIndicator = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Indicator>
>(function NavigationMenuIndicator({ className, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Indicator
      ref={ref}
      className={cx(
        "top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in",
        className,
      )}
      {...props}
    >
      <div className="bg-border relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  );
});
NavigationMenu.Indicator = NavigationMenuIndicator;
