import { useEffect } from "react";
import type { RefCallback } from "react";
import { isTypingTarget } from "@/features/timeline/controller";
import type { CanvasCourierHost } from "@/lib/canvas_courier";
import type { Rect } from "./workers/map/atlas";
import { useEu5Engine, useEu5MapNamesVisible } from "./store";

/** The panels over the map */
const covers = new Set<HTMLElement>();
const coverListeners = new Set<() => void>();
const coversChanged = () => coverListeners.forEach((listen) => listen());

/** Mark a panel over the map, so that no name on the map goes under it. */
export const mapCoverRef: RefCallback<HTMLElement> = (element) => {
  if (element === null) return;
  covers.add(element);
  coversChanged();
  return () => {
    covers.delete(element);
    coversChanged();
  };
};

/**
 * The names on the map are drawn by the map worker. This tells it where the
 * panels are, and lets "N" show or hide the names.
 */
export function MapNames({
  host,
  busy,
}: {
  host: CanvasCourierHost;
  /** The next save of the campaign loads, and the engine of this save takes no input. */
  busy: boolean;
}) {
  useMapNameCovers(host);
  useMapNamesKey(busy);
  return null;
}

/**
 * Measure the panels over the map, and send their places to the map when
 * they change: when a panel comes, goes, changes size or moves.
 */
function useMapNameCovers(host: CanvasCourierHost) {
  const engine = useEu5Engine();

  useEffect(() => {
    let frame = 0;
    let sent = "";
    /** Panels that move now, so they are measured on each frame until they stop */
    const moving = new Set<EventTarget>();

    const measure = () => {
      frame = 0;
      const canvas = host.canvas;
      if (canvas === null) return;
      const origin = canvas.getBoundingClientRect();
      const rects: Rect[] = [];
      for (const element of covers) {
        const box = element.getBoundingClientRect();
        const x0 = Math.max(box.left, origin.left) - origin.left;
        const y0 = Math.max(box.top, origin.top) - origin.top;
        const x1 = Math.min(box.right, origin.right) - origin.left;
        const y1 = Math.min(box.bottom, origin.bottom) - origin.top;
        if (x1 > x0 && y1 > y0) {
          rects.push({
            // Round outward, so that the rectangle holds all of the panel.
            x: Math.floor(x0),
            y: Math.floor(y0),
            width: Math.ceil(x1) - Math.floor(x0),
            height: Math.ceil(y1) - Math.floor(y0),
          });
        }
      }
      const key = JSON.stringify(rects);
      if (key !== sent) {
        sent = key;
        engine.trigger.coverMapNames(rects);
      }
      if (moving.size > 0) schedule();
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    const resizes = new ResizeObserver(schedule);
    const observe = () => {
      resizes.disconnect();
      if (host.canvas !== null) resizes.observe(host.canvas);
      covers.forEach((element) => resizes.observe(element));
      for (const element of moving) {
        if (!covers.has(element as HTMLElement)) moving.delete(element);
      }
      schedule();
    };
    observe();
    coverListeners.add(observe);

    // A panel that slides in or out does not change its size.
    const start = (event: Event) => {
      if (!covers.has(event.target as HTMLElement)) return;
      moving.add(event.target!);
      schedule();
    };
    const stop = (event: Event) => {
      if (!covers.has(event.target as HTMLElement)) return;
      moving.delete(event.target!);
      schedule();
    };
    const starts = ["transitionrun", "animationstart"];
    const stops = ["transitionend", "transitioncancel", "animationend", "animationcancel"];
    starts.forEach((type) => document.addEventListener(type, start, true));
    stops.forEach((type) => document.addEventListener(type, stop, true));

    return () => {
      coverListeners.delete(observe);
      resizes.disconnect();
      cancelAnimationFrame(frame);
      starts.forEach((type) => document.removeEventListener(type, start, true));
      stops.forEach((type) => document.removeEventListener(type, stop, true));
    };
  }, [engine, host]);
}

/** "N" shows or hides the names, from anywhere but a field. */
function useMapNamesKey(busy: boolean) {
  const engine = useEu5Engine();
  const visible = useEu5MapNamesVisible();

  useEffect(() => {
    if (busy) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "n" && event.key !== "N") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      engine.trigger.setMapNamesVisible(!visible);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine, visible, busy]);
}
