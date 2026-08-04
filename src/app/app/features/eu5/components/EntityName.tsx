import type React from "react";
import { cx } from "class-variance-authority";
import { focusRing } from "./focusRing";

export const entityLinkControl = cx("group/entity-link focus-visible:rounded-[1px]", focusRing);

export function EntityName({ className, ...props }: React.ComponentPropsWithoutRef<"span">) {
  return (
    <span
      {...props}
      className={cx(
        "text-game-ink-100 underline decoration-game-ink-rule decoration-solid decoration-1 underline-offset-2",
        "group-hover/entity-link:decoration-game-ink-100 group-focus-visible/entity-link:decoration-game-ink-100",
        className,
      )}
    />
  );
}
