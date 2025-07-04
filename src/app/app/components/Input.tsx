import React from "react";
import { cx } from "class-variance-authority";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, type, ...props }, ref) {
    return (
      <input
        type={type}
        className={cx(
          "flex rounded-md border border-solid border-gray-400 bg-white text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-slate-700",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
