import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { cx } from "class-variance-authority";
import { isTypingTarget } from "@/features/timeline/controller";
import type { RealmLabels } from "@/wasm/wasm_eu5";
import {
  useEu5Engine,
  useEu5HomeCountry,
  useEu5MapMode,
  useEu5MapViewport,
  useEu5SelectionRevision,
  useEu5SelectionState,
  useEu5TimelineMapDate,
  useEu5TimelinePlayback,
} from "../store";
import { useViewportInsets } from "../useViewportInsets";
import { useEu5TimelineBarHeight } from "../store";
import { useRanking } from "./ModeRanking";
import { useMapHoverLabel } from "./mapHover";
import { setNameCount } from "./nameCount";
import type { HoverLabel } from "./mapHover";
import { useSelectedCountries } from "./selected";
import { namePriority, placeNames, realmShape } from "./atlas";
import type { Box, RealmName, View } from "./atlas";

let namesOn = true;
const namesListeners = new Set<() => void>();

/** The names on the map can go away, for a clean look at the colours. */
export function useMapNames(): [boolean, () => void] {
  const on = useSyncExternalStore(
    (listen) => {
      namesListeners.add(listen);
      return () => namesListeners.delete(listen);
    },
    () => namesOn,
  );
  return [
    on,
    useCallback(() => {
      namesOn = !namesOn;
      namesListeners.forEach((listen) => listen());
    }, []),
  ];
}

/** The "N" key toggles the names, from anywhere but a field. */
export function useMapNamesKey() {
  const [, toggle] = useMapNames();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "n" && event.key !== "N") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);
}

type Point = { x: number; y: number };

/** A map of categories always names this many of the largest, and the key lists them. */
const CATEGORY_NAMES = 8;

/** The modes whose labels name what the mode colours, and not the countries. */
const isCategoryMode = (mode: string) => mode === "religion" || mode === "markets";

/**
 * The names to set on this map, with their shapes. At rest each realm is a candidate,
 * or on a map of religions or markets each of those. With a selection only its
 * countries are, because the rest of the map is the ground of the figure. Names and
 * land are those of the date that the map shows. The viewed country and the subject of
 * the headline come first, so that the image says what its title says.
 */
export function useRealmNames(): { names: RealmName[]; worldWidth: number | null } {
  const engine = useEu5Engine();
  const viewport = useEu5MapViewport();
  const selection = useEu5SelectionState();
  const selected = useSelectedCountries();
  const date = useEu5TimelineMapDate();
  const playback = useEu5TimelinePlayback();
  const mode = useEu5MapMode();
  const home = useEu5HomeCountry();
  const ranking = useRanking(mode);
  // A category map names the land of the selection, so a new selection asks again.
  const revision = useEu5SelectionRevision();
  const [labels, setLabels] = useState<RealmLabels | null>(null);
  const [points, setPoints] = useState<ReadonlyMap<number, Point>>(new Map());
  const playing = playback === "playing" || playback === "rewinding";
  // Playback moves fast, so its names follow once a year.
  const dateKey = playing ? `${date.year}` : `${date.year}-${date.month}-${date.day}`;
  const kind = isCategoryMode(mode) ? mode : "realms";

  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        void engine.queries
          .getRealmLabels()
          .then((found) => {
            if (live) setLabels(found);
          })
          // The save can close while a question is on its way, and then no one needs the answer.
          .catch(() => {});
      },
      playing ? 0 : 120,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [engine, dateKey, playing, kind, revision]);

  useEffect(() => {
    if (!labels) return;
    const missing = [
      ...new Set(labels.labels.flatMap((l) => l.points).filter((id) => !points.has(id))),
    ];
    if (missing.length === 0) return;
    let live = true;
    void engine.trigger
      .worldPointsOfIds(missing)
      .then((flat) => {
        if (!live) return;
        setPoints((known) => {
          const next = new Map(known);
          missing.forEach((id, i) => next.set(id, { x: flat[i * 2], y: flat[i * 2 + 1] }));
          return next;
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [engine, labels, points]);

  const worldWidth = viewport?.world.width ?? null;
  // Two realms can have one name, so a shape goes with its label and not with its name.
  const shaped = useMemo(() => {
    if (!labels || worldWidth === null) return [];
    return labels.labels.flatMap((label) => {
      const known = label.points.flatMap((id) => points.get(id) ?? []);
      const shape = realmShape(known, worldWidth);
      return shape ? [{ label, shape }] : [];
    });
  }, [labels, points, worldWidth]);

  const atRest = selection == null || selection.isEmpty;
  const entity = selection?.preset === "players" ? undefined : selection?.activeProfile;
  const onlyCountry = entity?.kind === "country" ? entity.country.key : null;
  const chosen = useMemo(() => new Set(selected.map((c) => c.country.key)), [selected]);
  const homeIdx = home?.countryIdx ?? null;
  const leaderIdx = ranking?.rows[0]?.country?.country.key ?? null;
  const names = useMemo(() => {
    const largest = [...shaped]
      .filter((x) => x.label.countryIdx === undefined)
      .sort((a, b) => b.label.locationCount - a.label.locationCount)
      .slice(0, CATEGORY_NAMES);
    return shaped.flatMap(({ label, shape }): RealmName[] => {
      // A map of categories has only the names of the land in scope, from the query.
      const inSelection =
        atRest ||
        isCategoryMode(mode) ||
        (label.countryIdx !== undefined &&
          (label.countryIdx === onlyCountry || chosen.has(label.countryIdx)));
      if (!inSelection) return [];
      const isHome = label.countryIdx !== undefined && label.countryIdx === homeIdx;
      const isLeader = label.countryIdx !== undefined && label.countryIdx === leaderIdx;
      const isTop = label.greatPowerRank > 0 && label.greatPowerRank <= 10;
      const isCategory = largest.some((x) => x.label === label);
      return [
        {
          key: `${label.countryIdx ?? "gone"}-${label.name}`,
          name: label.name,
          shape,
          priority: namePriority({ ...label, isHome, isLeader }),
          must: isHome || isLeader || isTop || isCategory || label.isPlayer || !atRest,
          lead: isHome || isLeader,
        },
      ];
    });
  }, [shaped, atRest, onlyCountry, chosen, homeIdx, leaderIdx, mode]);

  return { names, worldWidth };
}

/** The tag of a hover stands above its point, with its centre at `left`. */
function touchesHoverTag(
  name: { left: number; top: number; size: number; name: string },
  left: number,
  top: number,
  chars: number,
) {
  const halfTag = (chars * 7) / 2 + 6;
  const halfName = (name.name.length * name.size * 0.6) / 2;
  return (
    Math.abs(name.left - left) < halfTag + halfName &&
    name.top + name.size / 2 > top - 20 &&
    name.top - name.size / 2 < top
  );
}

/** The map key stands over the map, so no name goes under it. */
function keyBox(): Box[] {
  const key = document.querySelector('[aria-label="Map key"]')?.getBoundingClientRect();
  return key ? [{ x0: key.left, y0: key.top, x1: key.right, y1: key.bottom }] : [];
}

/**
 * Names on the map, set as an atlas sets them: along the land, sized by the realm,
 * with a halo, and the highest rank first. The row that has the pointer also names
 * itself with its value. A note counts the players that have no room.
 */
export function MapLabels() {
  const engine = useEu5Engine();
  const viewport = useEu5MapViewport();
  const insets = useViewportInsets();
  const timeline = useEu5TimelineBarHeight();
  const rowHover = useMapHoverLabel();
  const selection = useEu5SelectionState();
  const mode = useEu5MapMode();
  const [on] = useMapNames();
  const { names, worldWidth } = useRealmNames();
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
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const publish = () => setFrame({ width: el.clientWidth, height: el.clientHeight });
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [hoverPoint, setHoverPoint] = useState<{ idx: number; point: Point } | null>(null);
  const hoverIdx = hover?.locationIdx ?? null;

  useEffect(() => {
    if (hoverIdx === null) return;
    let live = true;
    void engine.trigger
      .worldPointsOf([hoverIdx])
      .then(([point]) => {
        if (live && point) setHoverPoint({ idx: hoverIdx, point });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [engine, hoverIdx]);

  const layer = "pointer-events-none absolute inset-0 z-10 overflow-hidden";
  const placement =
    on && viewport && frame && worldWidth !== null
      ? placeNames(
          names,
          viewport.viewport,
          worldWidth,
          frame,
          {
            left: insets.left + 4,
            right: 4,
            top: 44,
            bottom: insets.bottom + (timeline > 0 ? timeline + 16 : 0),
          },
          keyBox(),
        )
      : null;
  const mustNames = names.filter((name) => name.must).map((name) => name.key);
  const mustShown = placement
    ? placement.placed.filter((name) => mustNames.includes(name.key)).length
    : 0;
  const mustMissing = placement?.missing.length ?? 0;
  useEffect(() => {
    setNameCount({ shown: mustShown, wanted: mustShown + mustMissing });
  }, [mustShown, mustMissing]);

  if (!viewport || !frame || worldWidth === null) {
    return <div ref={measure} aria-hidden className={layer} />;
  }

  const view: View = viewport.viewport;
  const allPlaced = placement?.placed ?? [];

  const hoverAt =
    hover && hoverPoint?.idx === hover.locationIdx
      ? (() => {
          const dx = (((hoverPoint.point.x - view.x) % worldWidth) + worldWidth) % worldWidth;
          return {
            left: (dx / view.width) * frame.width,
            top: ((hoverPoint.point.y - view.y) / view.height) * frame.height,
          };
        })()
      : null;
  const showHover =
    hover !== null &&
    hoverAt !== null &&
    hoverAt.left > insets.left + 38 &&
    hoverAt.left < frame.width - 38 &&
    hoverAt.top > 20;
  // A hover tag and a name never print over each other: the name gives way.
  const placed =
    showHover && hover && hoverAt
      ? allPlaced.filter(
          (name) => !touchesHoverTag(name, hoverAt.left, hoverAt.top, hover.text.length),
        )
      : allPlaced;

  return (
    <div ref={measure} aria-hidden className={layer}>
      {placed.some((name) => name.anchor) ? (
        <svg className="absolute inset-0 h-full w-full">
          {placed.map((name) =>
            name.anchor ? (
              <g key={name.key}>
                <line
                  x1={name.anchor.left}
                  y1={name.anchor.top}
                  x2={name.left}
                  y2={name.top}
                  stroke="rgba(10,12,16,0.85)"
                  strokeWidth={2.5}
                />
                <line
                  x1={name.anchor.left}
                  y1={name.anchor.top}
                  x2={name.left}
                  y2={name.top}
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={1}
                />
              </g>
            ) : null,
          )}
        </svg>
      ) : null}
      {placed.map((name) => (
        <span
          key={name.key}
          className={cx(
            "absolute font-game-ui font-semibold whitespace-nowrap",
            mode === "political" ? "text-white/95" : "text-white",
          )}
          style={{
            left: name.left,
            top: name.top,
            fontSize: name.size,
            letterSpacing: name.capitals ? "0.14em" : undefined,
            textTransform: name.capitals ? "uppercase" : undefined,
            transform: `translate(-50%, -50%) rotate(${name.angle}rad)`,
            // A halo in place of a chip, so that the name sits on the land.
            textShadow:
              "0 0 1px rgba(10,12,16,1), 0 0 3px rgba(10,12,16,0.95), 0 0 6px rgba(10,12,16,0.8), 0 1px 1px rgba(10,12,16,0.9)",
          }}
        >
          {name.name}
        </span>
      ))}
      {showHover && hover ? (
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
