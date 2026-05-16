import type React from "react";
import { composeEventHandlers, useEu5MapHoverTarget } from "./useEu5MapHoverTarget";
import type { Eu5MapHoverTarget } from "./useEu5MapHoverTarget";

type MapHoverButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  target: Eu5MapHoverTarget;
};

export function MapHoverButton({ target, ...props }: MapHoverButtonProps) {
  const hoverProps = useEu5MapHoverTarget(target);
  const { onMouseEnter, onMouseLeave, onFocus, onBlur, ...buttonProps } = props;

  return (
    <button
      type="button"
      {...buttonProps}
      onMouseEnter={composeEventHandlers(hoverProps.onMouseEnter, onMouseEnter)}
      onMouseLeave={composeEventHandlers(hoverProps.onMouseLeave, onMouseLeave)}
      onFocus={composeEventHandlers(hoverProps.onFocus, onFocus)}
      onBlur={composeEventHandlers(hoverProps.onBlur, onBlur)}
    />
  );
}
