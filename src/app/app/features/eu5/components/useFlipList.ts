import { useEffectEvent, useLayoutEffect, useRef } from "react";
import type { DependencyList } from "react";
import {
  DOM_TRANSITION_DURATION,
  DOM_TRANSITION_EASING,
  adaptiveDuration,
  prefersReducedMotion,
} from "@/components/viz/chartMotion";

interface FlipListOptions<TItem extends HTMLElement, TMeta> {
  selector: string;
  getKey: (element: TItem) => string;
  /** Disable layout reads and animations while the container is off-screen. */
  enabled?: boolean;
  readMeta?: (element: TItem) => TMeta;
  /** Runs in the write phase after all layout measurements have completed. */
  onUpdate?: (
    element: TItem,
    meta: TMeta,
    previousMeta: TMeta | undefined,
    reduced: boolean,
  ) => void;
}

/**
 * Shared FLIP list reordering animation hook.
 * Always batches all layout reads before cancelling or starting Web Animations
 * to prevent interleaved layout thrashing, and measures visual positions relative
 * to the container so interrupting an in-flight transition does not teleport rows.
 */
export function useFlipList<
  TContainer extends HTMLElement,
  TItem extends HTMLElement = HTMLElement,
  TMeta = undefined,
>(options: FlipListOptions<TItem, TMeta>, deps: DependencyList) {
  const containerRef = useRef<TContainer>(null);
  const previousRef = useRef(new Map<string, { top: number; meta: TMeta }>());
  const animationsRef = useRef(new Map<TItem, Animation>());
  const lastUpdateRef = useRef<number | null>(null);

  const runFlip = useEffectEvent(() => {
    const container = containerRef.current;
    if (!container) return;
    const { selector, getKey, enabled = true, readMeta, onUpdate } = options;

    if (!enabled) {
      for (const animation of animationsRef.current.values()) animation.cancel();
      animationsRef.current.clear();
      previousRef.current.clear();
      lastUpdateRef.current = null;
      return;
    }

    const reduced = prefersReducedMotion();
    const now = performance.now();
    const duration = adaptiveDuration(lastUpdateRef.current, now, DOM_TRANSITION_DURATION);

    // Phase 1: Batch all DOM reads (using visual rects relative to container so
    // mid-flight rows smoothly redirect instead of teleporting) before any writes.
    const containerTop = container.getBoundingClientRect().top;
    const measured = Array.from(container.querySelectorAll<TItem>(selector), (element) => {
      const visualTop = element.getBoundingClientRect().top - containerTop;
      const layoutTop = element.offsetTop;
      return {
        element,
        key: getKey(element),
        visualTop,
        layoutTop,
        meta: readMeta ? readMeta(element) : (undefined as TMeta),
      };
    });

    // Phase 2: Perform all animation cancellations and writes.
    const next = new Map<string, { top: number; meta: TMeta }>();
    for (const { element, key, visualTop, layoutTop, meta } of measured) {
      const prev = previousRef.current.get(key);
      const activeAnim = animationsRef.current.get(element);
      const fromTop = activeAnim && activeAnim.playState === "running" ? visualTop : prev?.top;
      next.set(key, { top: layoutTop, meta });
      if (!reduced && fromTop != null && Math.abs(fromTop - layoutTop) > 0.5) {
        activeAnim?.cancel();
        animationsRef.current.set(
          element,
          element.animate(
            [{ transform: `translateY(${fromTop - layoutTop}px)` }, { transform: "translateY(0)" }],
            { duration, easing: DOM_TRANSITION_EASING },
          ),
        );
      }
      onUpdate?.(element, meta, prev?.meta, reduced);
    }

    for (const [element, animation] of animationsRef.current) {
      if (!element.isConnected) {
        animation.cancel();
        animationsRef.current.delete(element);
      }
    }

    previousRef.current = next;
    lastUpdateRef.current = now;
  });

  useLayoutEffect(() => {
    runFlip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, options.enabled ?? true]);

  useLayoutEffect(() => {
    const animations = animationsRef.current;
    return () => {
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
    };
  }, []);

  return containerRef;
}
