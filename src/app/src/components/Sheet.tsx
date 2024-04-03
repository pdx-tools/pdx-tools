import React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, cx, type VariantProps } from "class-variance-authority";
import { Button } from "./Button";
import { XMarkIcon } from "@heroicons/react/24/outline";

// https://github.com/shadcn-ui/ui/issues/399
const SheetRoot = (props: React.ComponentProps<typeof SheetPrimitive.Root>) => (
  <SheetPrimitive.Root {...props} />
);

export const Sheet = SheetRoot as typeof SheetRoot & {
  Trigger: typeof SheetPrimitive.Trigger;
  Portal: typeof SheetPrimitive.Portal;
  Overlay: typeof SheetOverlay;
  Content: typeof SheetContent;
  Close: typeof SheetClose;
  Header: typeof SheetHeader;
  Body: typeof SheetBody;
  Footer: typeof SheetFooter;
  Title: typeof SheetTitle;
  Description: typeof SheetDescription;
};

Sheet.Trigger = SheetPrimitive.Trigger;
Sheet.Portal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(function SheetOverLay({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Overlay
      className={cx(
        "fixed inset-0 z-50 bg-sky-900/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
      ref={ref}
    />
  );
});
Sheet.Overlay = SheetOverlay;

const sheetVariants = cva(
  "fixed z-50 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 dark:border-gray-600",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right:
          "inset-y-0 right-0 h-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(function SheetContent(
  { side = "right", className, children, ...props },
  ref,
) {
  return (
    <Sheet.Portal>
      <Sheet.Overlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cx(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </Sheet.Portal>
  );
});
Sheet.Content = SheetContent;

const SheetClose = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Close>
>(function SheetClose({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Close
      {...props}
      ref={ref}
      asChild
      className={cx(
        className,
        "rounded-sm border-0 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-rose-500",
      )}
    >
      <Button variant="ghost" style={{ outline: "0" }}>
        <XMarkIcon className="h-5 w-5" />
        <span className="sr-only">Close</span>
      </Button>
    </SheetPrimitive.Close>
  );
});
Sheet.Close = SheetClose;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cx("flex text-center sm:text-left", className)} {...props} />
);
Sheet.Header = SheetHeader;

const SheetBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cx("relative max-h-full grow overflow-auto", className)}
    {...props}
  />
);
Sheet.Body = SheetBody;

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cx(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
Sheet.Footer = SheetFooter;

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(function SheetTitle({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Title
      ref={ref}
      className={cx("m-0 text-lg font-semibold", className)}
      {...props}
    />
  );
});
Sheet.Title = SheetTitle;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(function SheetDescription({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Description
      ref={ref}
      className={cx("text-sm text-gray-500", className)}
      {...props}
    />
  );
});
Sheet.Description = SheetDescription;
