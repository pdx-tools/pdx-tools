import { useEffect } from "react";

const hideUntilFound = (label: Element) => label.setAttribute("hidden", "until-found");

/**
 * Makes a hidden label searchable by find in page. React writes `hidden` as
 * a boolean (https://github.com/react/react/issues/24740), so the server
 * sends plain `hidden` and this ref changes it to `until-found` when the
 * label mounts. A browser without support for `until-found` keeps the label
 * hidden. When React accepts the string, set `hidden="until-found"` in the
 * JSX and remove this ref.
 */
export const findableRef = (label: HTMLSpanElement | null) => {
  if (label) {
    hideUntilFound(label);
  }
};

/**
 * Lets the browser's find in page search the wall by name. Each icon holds
 * its name in a label marked `data-find-label`. A label with
 * `hidden="until-found"` takes no space, but find in page can match it: the
 * browser then shows the label of the active match and fires `beforematch`.
 * Only one label shows at a time. It hides again when the next match shows,
 * or when the user clicks or tabs away from it. A label that shows under an
 * icon at the edge of the wall moves sideways to stay inside it.
 */
export function useFindableLabels(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const wall = root.current;
    if (!wall) {
      return;
    }

    const fit = (label: HTMLElement) => {
      label.style.marginLeft = "";
      const box = label.getBoundingClientRect();
      const bounds = wall.getBoundingClientRect();
      const shift = Math.max(bounds.left - box.left, 0) + Math.min(bounds.right - box.right, 0);
      label.style.marginLeft = `${shift}px`;
    };
    let shown: Element | null = null;
    const release = (target: EventTarget | null) => {
      const link = shown?.closest("a");
      if (shown && !(target instanceof Node && link?.contains(target))) {
        hideUntilFound(shown);
        shown = null;
      }
    };

    const onMatch = (event: Event) => {
      const label = event.target;
      if (!(label instanceof HTMLElement) || !label.hasAttribute("data-find-label")) {
        return;
      }
      if (shown && shown !== label) {
        hideUntilFound(shown);
      }
      shown = label;
      // The browser shows the label after this event, so measure it on the
      // next frame.
      requestAnimationFrame(() => fit(label));
    };
    const onPointerDown = (event: PointerEvent) => release(event.target);
    const onFocusOut = (event: FocusEvent) => release(event.relatedTarget);

    wall.addEventListener("beforematch", onMatch);
    wall.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      wall.removeEventListener("beforematch", onMatch);
      wall.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [root]);
}
