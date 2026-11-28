import { createContext, useContext, useEffect, useRef, useState } from "react";

const callbacks = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

/**
 * Allows a parent container (such as a data table) to share one IntersectionObserver
 * entry across all descendant numeric readouts instead of observing hundreds of cells.
 */
export const ElementVisibilityContext = createContext<boolean | null>(null);

/** One shared observer for visibility-gated animations, avoiding layout polling. */
export function useElementVisible<T extends Element = HTMLSpanElement>(disabled = false) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (disabled) return;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
    });
    callbacks.set(element, setVisible);
    observer.observe(element);
    return () => {
      callbacks.delete(element);
      observer?.unobserve(element);
      if (!callbacks.size) {
        observer?.disconnect();
        observer = undefined;
      }
    };
  }, [disabled]);
  return { ref, visible };
}

/** Uses an enclosing ElementVisibilityContext when provided, otherwise observes this element. */
export function useInheritedVisible<T extends Element = HTMLSpanElement>() {
  const inherited = useContext(ElementVisibilityContext);
  const own = useElementVisible<T>(inherited !== null);
  return { ref: own.ref, visible: inherited ?? own.visible };
}
