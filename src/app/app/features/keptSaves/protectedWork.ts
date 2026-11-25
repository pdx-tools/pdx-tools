import { useEffect } from "react";

let protectedWork = 0;
let dragging = false;

/** An after action report or an upload that a new save would end. */
export const hasProtectedWork = () => protectedWork > 0;

export function useProtectedWork(active: boolean) {
  useEffect(() => {
    if (!active) return;
    protectedWork += 1;
    return () => {
      protectedWork -= 1;
    };
  }, [active]);
}

/** The player drags, or has a popover or a menu open. A tooltip does not count. */
export function isInteracting(): boolean {
  const popover =
    "[data-radix-popper-content-wrapper] :is([role=dialog], [role=menu], [role=listbox])";
  return dragging || document.querySelector(popover) !== null;
}

/** Know about a drag also when its target stops the event. */
export function trackPointers(): () => void {
  const onDown = () => (dragging = true);
  const onUp = () => (dragging = false);
  const options = { capture: true };
  window.addEventListener("pointerdown", onDown, options);
  window.addEventListener("pointerup", onUp, options);
  window.addEventListener("pointercancel", onUp, options);
  return () => {
    dragging = false;
    window.removeEventListener("pointerdown", onDown, options);
    window.removeEventListener("pointerup", onUp, options);
    window.removeEventListener("pointercancel", onUp, options);
  };
}
