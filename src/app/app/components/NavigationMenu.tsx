import React from "react";
import { NavigationMenu as NavigationMenuPrimitive } from "radix-ui";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { cva, cx } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

const NavigationMenuRoot = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root>
>(function NavigationMenuRoot({ className, children, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Root
      ref={ref}
      className={cx("relative z-100 flex max-w-max flex-1 items-center justify-center", className)}
      {...props}
    >
      {children}
    </NavigationMenuPrimitive.Root>
  );
});

export const NavigationMenu = NavigationMenuRoot as typeof NavigationMenuRoot & {
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
  React.ComponentRef<typeof NavigationMenuPrimitive.List>,
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
  "group inline-flex w-full border-0 items-center justify-start text-white bg-slate-900 text-sm font-medium transition-colors hover:bg-sky-800 hover:text-gray-300 focus:bg-sky-800 focus:text-gray-300 focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-active:bg-sky-800/50 data-[state=open]:bg-sky-800/50",
  {
    variants: {
      variant: {
        default: "",
        // Tighter on phones so the bar keeps to one row beside the mark.
        button: "px-2 sm:px-4 py-2 cursor-pointer",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const NavigationMenuTrigger = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(function NavigationMenuTrigger({ className, children, asChild, ...props }, ref) {
  // `asChild` hands the trigger its own element, which must stay a single
  // child, so only a plain trigger carries the chevron that tells a menu
  // apart from a link. Below 360px the chevron gives its width to the
  // sign-in button, which must stay in view.
  return (
    <NavigationMenuPrimitive.Trigger
      ref={ref}
      className={cx(!asChild && navigationMenuTriggerStyle(), "group", className)}
      asChild={asChild}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {children}
          <ChevronDownIcon
            className="relative top-px ml-1.5 h-3 w-3 opacity-65 transition-transform duration-200 group-data-[state=open]:rotate-180 max-[359px]:hidden"
            aria-hidden="true"
          />
        </>
      )}
    </NavigationMenuPrimitive.Trigger>
  );
});
NavigationMenu.Trigger = NavigationMenuTrigger;

const NavigationMenuContent = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(function NavigationMenuContent({ className, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Content
      ref={ref}
      className={cx(
        "top-0 w-full data-[motion=from-end]:[--tw-enter-translate-x:13rem] data-[motion=from-start]:[--tw-enter-translate-x:-13rem] data-[motion=to-end]:[--tw-exit-translate-x:13rem] data-[motion=to-start]:[--tw-exit-translate-x:-13rem] data-[motion^=from-]:animate-enter data-[motion^=from-]:[--tw-enter-opacity:0] data-[motion^=to-]:animate-exit data-[motion^=to-]:[--tw-exit-opacity:0] motion-reduce:!animate-none md:absolute md:w-auto",
        className,
      )}
      {...props}
    />
  );
});
NavigationMenu.Content = NavigationMenuContent;

interface NavigationMenuLinkProps
  extends
    React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Link>,
    VariantProps<typeof navigationMenuTriggerStyle> {}

const NavigationMenuLink = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.Link>,
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
  React.ComponentRef<typeof NavigationMenuPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Viewport>
>(function NavigationMenuViewport({ className, ...props }, ref) {
  return (
    <div className={cx("absolute top-full z-100 flex justify-center", className)}>
      <NavigationMenuPrimitive.Viewport
        className="bg-popover text-popover-foreground relative mt-1.5 h-(--radix-navigation-menu-viewport-height) w-full overflow-hidden rounded-md border shadow-lg data-[state=closed]:animate-exit data-[state=closed]:[--tw-exit-scale:0.95] data-[state=open]:animate-enter data-[state=open]:[--tw-enter-scale:0.9] motion-reduce:!animate-none md:w-(--radix-navigation-menu-viewport-width)"
        ref={ref}
        {...props}
      />
    </div>
  );
});
NavigationMenu.Viewport = NavigationMenuViewport;

const NavigationMenuIndicator = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Indicator>
>(function NavigationMenuIndicator({ className, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Indicator
      ref={ref}
      className={cx(
        "top-full z-1 flex h-1.5 items-end justify-center overflow-hidden data-[state=hidden]:animate-exit data-[state=hidden]:[--tw-exit-opacity:0] data-[state=visible]:animate-enter data-[state=visible]:[--tw-enter-opacity:0] motion-reduce:!animate-none",
        className,
      )}
      {...props}
    >
      <div className="bg-border relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  );
});
NavigationMenu.Indicator = NavigationMenuIndicator;
