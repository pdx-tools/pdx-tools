import React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cx } from "class-variance-authority";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitives.Root
      className={cx(
        "peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent p-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-300/70 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-sky-600 data-[state=unchecked]:bg-gray-200 enabled:hover:data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600 dark:enabled:hover:data-[state=unchecked]:bg-gray-500",
        className,
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cx(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitives.Root>
  );
});
