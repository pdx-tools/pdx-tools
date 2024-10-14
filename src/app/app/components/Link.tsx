import { VariantProps, cva, cx } from "class-variance-authority";
import { Link as LinkPrimitive } from "@remix-run/react";
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
  Omit<ComponentPropsWithoutRef<typeof LinkPrimitive>, "to"> &
    VariantProps<typeof linkVariants> &
    (
      | { href: string }
      | { to: ComponentPropsWithoutRef<typeof LinkPrimitive>["to"] }
    )
>(function Link({ className, variant, ...props }, ref) {
  if ("href" in props) {
    const isExternal = props.href.toString().startsWith("http");
    return (
      <a
        className={cx(linkVariants({ variant }), className)}
        ref={ref}
        {...props}
        target={props.target ?? (isExternal ? "_blank" : undefined)}
        rel={props.rel ?? (isExternal ? "noreferrer" : undefined)}
      />
    );
  } else {
    return (
      <LinkPrimitive
        className={cx(linkVariants({ variant }), className)}
        ref={ref}
        {...props}
      />
    );
  }
});
