import React from "react";
import { cva, type VariantProps, cx } from "class-variance-authority";
import { getErrorMessage } from "@/lib/getErrorMessage";

const alert = cva("relative w-full border-2 border-solid flex", {
  variants: {
    variant: {
      success: "bg-green-100 border-green-200 text-gray-900",
      error: "bg-rose-100 border-rose-200 text-gray-900",
      info: "bg-sky-100 border-sky-200 text-gray-900",
      warning: "bg-amber-100 border-amber-200 text-gray-900",
    },
  },
});

const AlertRoot = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alert>
>(function Alert({ className, variant, children, ...props }, ref) {
  const [hasClosed, setHasClosed] = React.useState(false);
  if (hasClosed) {
    return null;
  }
  return (
    <div
      ref={ref}
      role="alert"
      className={cx(alert({ variant }), className)}
      {...props}
    >
      <div className="flex-grow">{children}</div>
      <button
        type="button"
        className="flex cursor-pointer border-none bg-transparent"
        aria-label="Close"
        onClick={() => setHasClosed(true)}
      >
        X
      </button>
    </div>
  );
});

export const Alert = AlertRoot as typeof AlertRoot & {
  Title: typeof AlertTitle;
  Description: typeof AlertDescription;
  Error: typeof AlertError;
};

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function AlertTitle({ className, ...props }, ref) {
  return (
    <h5
      ref={ref}
      className={cx(
        "mb-1 text-base font-medium leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
});
Alert.Title = AlertTitle;

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function AlertDescription({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cx("text-sm leading-relaxed", className)}
      {...props}
    />
  );
});
Alert.Description = AlertDescription;

const AlertError = ({
  msg,
  className,
}: {
  msg: string | undefined | unknown;
  className?: string | undefined;
}) => {
  if (!msg) {
    return null;
  }

  return (
    <Alert variant="error" className={className}>
      <AlertDescription>{getErrorMessage(msg)}</AlertDescription>
    </Alert>
  );
};
Alert.Error = AlertError;
