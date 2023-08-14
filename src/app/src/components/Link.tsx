import { cx } from "class-variance-authority";
import LinkPrimitive from "next/link";
import React, { ComponentPropsWithoutRef } from "react";

export const Link = React.forwardRef<
  HTMLAnchorElement,
  ComponentPropsWithoutRef<typeof LinkPrimitive> & {
    variant?: "light" | "dark";
  }
>(function Link({ className, variant = "dark", href, ...props }, ref) {
  const isExternal = href.toString().startsWith("http");

  return (
    <LinkPrimitive
      className={cx(
        variant == "dark" ? "text-sky-600" : "text-teal-400",
        "underline-offset-4 hover:underline",
        className,
      )}
      href={href}
      ref={ref}
      {...props}
      target={isExternal ? "_blank" : props.target}
      rel={isExternal ? "noreferrer" : props.rel}
    />
  );
});
