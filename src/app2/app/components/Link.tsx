import { VariantProps, cva, cx } from "class-variance-authority";
import LinkPrimitive from "next/link";
import React, { ComponentPropsWithoutRef } from "react";

const linkVariants = cva("underline-offset-4 hover:underline", {
  variants: {
    variant: {
      light: "text-teal-400",
      dark: "text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-500",
      ghost: "",
    },
  },
  defaultVariants: {
    variant: "dark",
  },
});

export const Link = React.forwardRef<
  HTMLAnchorElement,
  ComponentPropsWithoutRef<typeof LinkPrimitive> &
    VariantProps<typeof linkVariants>
>(function Link({ className, variant, href, ...props }, ref) {
  const isExternal = href.toString().startsWith("http");

  return (
    <LinkPrimitive
      className={cx(linkVariants({ variant }), className)}
      href={href}
      ref={ref}
      {...props}
      target={isExternal ? "_blank" : props.target}
      rel={isExternal ? "noreferrer" : props.rel}
    />
  );
});
