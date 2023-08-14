import { cx } from "class-variance-authority";
import React from "react";

export type SideBarButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
export const SideBarButton = React.forwardRef<
  HTMLButtonElement,
  SideBarButtonProps
>(function SideBarButton({ className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={cx(
        className,
        `inline-flex items-center justify-end gap-3 rounded-lg border-0 bg-transparent p-0 px-3 py-2 opacity-60 transition-opacity duration-100 hover:bg-sky-900 hover:opacity-100`,
      )}
      {...rest}
    />
  );
});
