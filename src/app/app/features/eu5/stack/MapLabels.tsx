import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { cx } from "class-variance-authority";
import { useEu5Engine, useEu5MapViewport, useEu5SelectionState } from "../store";
import { useViewportInsets } from "../useViewportInsets";
import { useSelectedCountries } from "./selected";

export type HoverLabel = { key: string; text: string; locationIdx: number };

let hovered: HoverLabel | null = null;
const listeners = new Set<() => void>();

/** A row of the column names itself on the map while it has the pointer. */
export function setMapHoverLabel(label: HoverLabel | null) {
  if (hovered?.key === label?.key) return;
  hovered = label;
  listeners.forEach((listen) => listen());
}

function useMapHoverLabel() {
  return useSyncExternalStore(
    (listen) => {
      listeners.add(listen);
      return () => listeners.delete(listen);
    },
    () => hovered,
  );
}

type Point = { x: number; y: number };

/** The room that one label takes, so labels that would touch are dropped */
const LABEL_WIDTH = 76;
const LABEL_HEIGHT = 20;

/**
 * Direct labels on the map: the name of each country of a selected set, as in the
 * rows, and the name and value of the row that has the pointer. The reader does not have to match a
 * swatch in the column with a colour on the map. A label that would touch a label
 * before it is left out, and the hovered row's label always shows.
 */
export function MapLabels() {
  const engine = useEu5Engine();
  const viewport = useEu5MapViewport();
  const insets = useViewportInsets();
  const selected = useSelectedCountries();
  const rowHover = useMapHoverLabel();
  // A selected location is small on the map, so it has its name there.
  const selection = useEu5SelectionState();
  const profile = selection?.preset === "players" ? undefined : selection?.activeProfile;
  const focus: HoverLabel | null =
    profile?.kind === "location"
      ? {
          key: `focus-${profile.location.key}`,
          text: profile.location.name,
          locationIdx: profile.location.key,
        }
      : null;
  const hover = rowHover ?? focus;
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  // The labels share the frame of the map, so its size places them.
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const publish = () => setFrame({ width: el.clientWidth, height: el.clientHeight });
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [points, setPoints] = useState<ReadonlyMap<number, Point>>(new Map());

  const set = selected.length > 1 ? selected : [];
  const wanted = [...set.map((c) => c.anchorLocationIdx), ...(hover ? [hover.locationIdx] : [])];
  const missing = wanted.filter((idx) => !points.has(idx));
  const missingKey = missing.join(",");

  useEffect(() => {
    if (missingKey === "") return;
    const asked = missingKey.split(",").map(Number);
    let live = true;
    void engine.trigger.worldPointsOf(asked).then((found) => {
      if (!live) return;
      setPoints((known) => {
        const next = new Map(known);
        found.forEach((point, i) => {
          if (point) next.set(asked[i], point);
        });
        return next;
      });
    });
    return () => {
      live = false;
    };
  }, [engine, missingKey]);

  const layer = "pointer-events-none absolute inset-0 z-10 overflow-hidden";
  if (!viewport || !frame) return <div ref={measure} aria-hidden className={layer} />;

  const project = (point: Point) => {
    const { world, viewport: view } = viewport;
    // The map wraps, so a point before the view's left edge can be one world later.
    const dx = (((point.x - view.x) % world.width) + world.width) % world.width;
    return {
      left: (dx / view.width) * frame.width,
      top: ((point.y - view.y) / view.height) * frame.height,
    };
  };
  const onMap = ({ left, top }: { left: number; top: number }) =>
    left > insets.left + LABEL_WIDTH / 2 &&
    left < frame.width - LABEL_WIDTH / 2 &&
    top > LABEL_HEIGHT &&
    top < frame.height - insets.bottom;

  const placed: { left: number; top: number }[] = [];
  const free = (at: { left: number; top: number }) =>
    placed.every(
      (p) => Math.abs(p.left - at.left) > LABEL_WIDTH || Math.abs(p.top - at.top) > LABEL_HEIGHT,
    );

  const hoverPoint = hover ? points.get(hover.locationIdx) : undefined;
  const hoverAt = hoverPoint ? project(hoverPoint) : null;
  const showHover = hover !== null && hoverAt !== null && onMap(hoverAt);
  if (showHover) placed.push(hoverAt);

  const labels = set.flatMap((country) => {
    const point = points.get(country.anchorLocationIdx);
    if (!point) return [];
    const at = project(point);
    if (!onMap(at) || !free(at)) return [];
    placed.push(at);
    return [{ country, at }];
  });

  // A set can have more names than the map has room for. The reader must not take a
  // missing label for a missing country.
  const left = set.length - labels.length;
  return (
    <div ref={measure} aria-hidden className={layer}>
      {left > 0 ? (
        <span
          className="absolute top-2 rounded-[2px] bg-game-panel px-1.5 font-game-ui text-[12px] leading-[18px] text-game-ink-300 shadow-md"
          style={{ left: insets.left + 8 }}
        >
          {labels.length} of {set.length} labelled. Zoom in for more
        </span>
      ) : null}
      {labels.map(({ country, at }) => (
        <span
          key={country.country.key}
          className="absolute flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-[2px] bg-game-panel px-1 font-game-ui text-[12px] leading-[16px] whitespace-nowrap text-game-ink-100 shadow-md"
          style={at}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-[1px] shadow-[inset_0_0_0_1px_var(--game-rim)]"
            style={{ background: country.colorHex }}
          />
          {country.country.name}
        </span>
      ))}
      {showHover ? (
        <span
          className={cx(
            "absolute -translate-x-1/2 -translate-y-full rounded-[2px] px-1.5 font-game-ui text-[12px] leading-[18px] font-medium whitespace-nowrap shadow-md",
            // Cream is only for the row under the pointer.
            rowHover ? "bg-game-accent-100 text-game-page" : "bg-game-panel text-game-ink-100",
          )}
          style={hoverAt}
        >
          {hover.text}
        </span>
      ) : null}
    </div>
  );
}
