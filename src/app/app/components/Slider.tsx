import React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cx } from "class-variance-authority";

type SliderProps = {
  rounded?: boolean;
} & React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>;

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(function Slider({ className, rounded = true, ...props }, ref) {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cx(
        "relative flex w-full touch-none select-none items-center",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        className={cx(
          rounded && "rounded-full",
          "relative h-2 w-full grow overflow-hidden bg-sky-100 data-[disabled]:cursor-not-allowed",
        )}
      >
        <SliderPrimitive.Range className="absolute h-full bg-sky-300 data-[disabled]:bg-gray-300 dark:bg-sky-500" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="focus-visible:ring-ring block h-5 w-5 rounded-full border-2 border-solid border-sky-400 bg-white ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[disabled]:cursor-not-allowed" />
    </SliderPrimitive.Root>
  );
});
