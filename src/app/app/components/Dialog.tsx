import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cx } from "class-variance-authority";
import { XMarkIcon } from "@heroicons/react/24/outline";

export const Dialog = DialogPrimitive.Root as typeof DialogPrimitive.Root & {
  Close: typeof DialogPrimitive.Close;
  Trigger: typeof DialogPrimitive.Trigger;
  Portal: typeof DialogPrimitive.Portal;
  Overlay: typeof DialogOverlay;
  Content: typeof DialogContent;
  Header: typeof DialogHeader;
  Footer: typeof DialogFooter;
  Title: typeof DialogTitle;
  Description: typeof DialogDescription;
};
Dialog.Close = DialogPrimitive.Close;
Dialog.Trigger = DialogPrimitive.Trigger;
Dialog.Portal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cx(
        "fixed inset-0 z-[1001] backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
});
Dialog.Overlay = DialogOverlay;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(function DialogContent({ className, children, ...props }, ref) {
  return (
    <Dialog.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cx(
          "fixed left-[50%] top-[50%] z-[1001] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-solid bg-white p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg md:w-full dark:border-gray-600 dark:bg-slate-900",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm border-0 bg-transparent opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-sky-100 data-[state=open]:text-sky-500">
          <XMarkIcon className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </Dialog.Portal>
  );
});
Dialog.Content = DialogContent;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cx(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
Dialog.Header = DialogHeader;

const DialogFooter = ({
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
Dialog.Footer = DialogFooter;

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cx(
        "text-lg font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
});
Dialog.Title = DialogTitle;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cx("text-sm text-gray-600 dark:text-gray-300", className)}
      {...props}
    />
  );
});
Dialog.Description = DialogDescription;
