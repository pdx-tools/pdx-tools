import { useEffect, useRef, useState } from "react";

const callbacks = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;
/** One observer for numeric readouts, rather than polling layout during digit animations. */
export function useElementVisible() {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
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
  }, []);
  return { ref, visible };
}
