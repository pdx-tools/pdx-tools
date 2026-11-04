import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import ArrowsPointingOutIcon from "@heroicons/react/16/solid/ArrowsPointingOutIcon";
import ArrowsPointingInIcon from "@heroicons/react/16/solid/ArrowsPointingInIcon";
import { focusRing } from "@/components/game/focusRing";
import { formatLongDate } from "@/features/timeline/date";
import {
  useEu5MapMode,
  useEu5SaveDate,
  useEu5SelectionState,
  useEu5TimelineLive,
  useSetEu5ColumnInset,
} from "../store";
import { useMapHistory } from "../history/context";
import { parentOf } from "../control-panel/modeConfig";
import {
  PanelNavProvider,
  crumbsAbove,
  entryKey,
  entryLabel,
  isColumnEscape,
  profileKey,
  usePanelNav,
} from "../features/profiles/PanelNavContext";
import type { MapMode } from "@/wasm/wasm_eu5";
import type { PanelNavEntry } from "../features/profiles/PanelNavContext";
import { ColumnHead } from "./ColumnHead";
import { SelectedCountriesProvider } from "./selected";
import { LevelView, NARROW_WIDTH, levelWidth } from "./levels";
import { Note, ShowOnMap, StackCrumbs } from "./parts";
import { insightLabel } from "./selection";
import { MapBar } from "./MapBar";
import { LevelTabs } from "./LevelTabs";
import { MapKey } from "./MapKey";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { MapLabels } from "./MapLabels";
import { SaveActionsProvider } from "../control-panel/SaveMenu";

/**
 * One Stack: one column beside the map that goes deeper, never wider than
 * its level asks. It replaces the control panel and the insight panel, so
 * the map keeps the frame while the reader chooses and reads.
 */
export function Eu5Column({
  onExpand,
  expanded,
}: {
  onExpand: (expanded: boolean) => void;
  /** A level has the frame, and the map is an inset over it */
  expanded: boolean;
}) {
  const preview = useMapHistory()?.preview;
  // A phone has the key at the top of the sheet, so nothing covers the small map.
  const desktop = useBreakpoint("md");
  return (
    <PanelNavProvider>
      <SelectedCountriesProvider>
        <SaveActionsProvider>
          <ColumnFrame onExpand={onExpand} />
          <MapBar />
          {!expanded && !preview && desktop ? <MapKey /> : null}
          {!expanded && !preview ? <MapLabels /> : null}
        </SaveActionsProvider>
      </SelectedCountriesProvider>
    </PanelNavProvider>
  );
}

function ColumnFrame({ onExpand }: { onExpand: (expanded: boolean) => void }) {
  const nav = usePanelNav();
  const preview = useMapHistory()?.preview;
  const width = levelWidth(nav.top);
  const wide = width > NARROW_WIDTH;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Expand belongs to the level that asked for it; another level returns the map.
  const topKey = nav.top ? entryKey(nav.top) : null;
  const expanded = wide && expandedKey !== null && expandedKey === topKey;
  const ref = useColumnInset(width, expanded);
  const clearance = useMapInsetClearance(expanded, ref);
  const frame = "md:w-(--level-width)";
  const frameWidth = expanded ? "100cqw" : wide ? `min(${width}px,62cqw)` : `${width}px`;

  useEffect(() => {
    onExpand(expanded);
  }, [expanded, onExpand]);

  // Esc goes up one level, as the parent crumb does. At the caption it goes
  // on to the map, which clears the selection. The listener is on the
  // document, so it runs before the map's Esc on the window.
  const back = nav.back;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isColumnEscape(event) || preview) return;
      // While the next save of a campaign loads, the column takes no input.
      if (ref.current?.closest("[inert]")) return;
      if (back()) event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [back, preview, ref]);

  const expand = wide ? (
    <ExpandLevel expanded={expanded} onToggle={() => setExpandedKey(expanded ? null : topKey)} />
  ) : null;

  return (
    <aside
      ref={ref}
      aria-label="Save analysis"
      style={{ "--level-width": frameWidth } as React.CSSProperties}
      className={cx(
        "pointer-events-auto absolute z-30 border-game-line-strong bg-game-panel font-game-ui md:overflow-hidden",
        // On a phone the map comes first, and the column is a sheet over it that
        // the grabber resizes. The grabber's target goes a little over the map.
        "max-md:inset-x-0 max-md:bottom-0 max-md:h-(--sheet-height) max-md:border-t",
        "max-md:transition-[height] max-md:duration-200 max-md:ease-[cubic-bezier(0.22,1,0.36,1)]",
        "md:inset-y-0 md:left-0 md:border-r",
        "motion-reduce:transition-none md:transition-[width] md:duration-200 md:ease-[cubic-bezier(0.22,1,0.36,1)]",
        frame,
        expanded && "md:border-r-0",
      )}
    >
      {/* The content takes the level's width at once and the glide reveals
          it, so charts lay out one time rather than on every frame. A grid in
          a level follows this width, not the width of the window. */}
      <div className={cx("@container flex h-full flex-col max-md:w-full", frame)}>
        <ColumnHead />
        {/* One navigation row: the tabs at a first level, and the trail under it. */}
        {preview ? null : nav.path.length > 1 || nav.top?.kind === "section" ? (
          <Crumbs expand={expand} />
        ) : (
          <LevelTabs action={expand} />
        )}
        <div
          data-column-body
          className={cx(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain",
            // The map inset floats over the bottom right. This space lets the
            // end of the level scroll clear of it.
            expanded && "md:pb-(--map-clearance)",
          )}
          style={{ "--map-clearance": `${clearance}px` } as React.CSSProperties}
        >
          {preview ? (
            <Note>Charts become available when playback pauses and this save has loaded.</Note>
          ) : (
            <div>
              <SaveDateNote />
              <LevelView key={topKey ?? "root"} entry={nav.top} />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/** The map mode that shows what a level is about, if one does */
function modeOfLevel(entry: PanelNavEntry): { mode: MapMode; label: string } | undefined {
  if (entry.kind !== "section") return undefined;
  switch (entry.section) {
    case "population":
      return { mode: "population", label: "population" };
    case "religion":
      return { mode: "religion", label: "religion" };
    case "buildings":
      return { mode: "buildingLevels", label: "buildings" };
    case "goods":
      return { mode: "markets", label: "markets" };
    default:
      return undefined;
  }
}

function ExpandLevel({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={expanded}
      aria-label={expanded ? "Return the map" : "Give this level the whole frame"}
      className={cx(
        "flex h-6 items-center gap-1 rounded-control px-1.5 font-game-ui text-[12px] whitespace-nowrap text-game-ink-300 hover:bg-game-panel-hover hover:text-game-ink-100 max-md:hidden",
        focusRing,
      )}
    >
      {expanded ? (
        <ArrowsPointingInIcon aria-hidden className="h-3.5 w-3.5" />
      ) : (
        <ArrowsPointingOutIcon aria-hidden className="h-3.5 w-3.5" />
      )}
      {expanded ? "Return the map" : "Full width"}
    </button>
  );
}

function Crumbs({ expand }: { expand: React.ReactNode }) {
  const nav = usePanelNav();
  const data = insightLabel(parentOf(useEu5MapMode()).label);
  const selection = useEu5SelectionState();
  const profile = selection?.preset === "players" ? undefined : selection?.activeProfile;
  const selectedKey = profile ? profileKey(profile) : null;
  // The strip names the selection, so its own level is "Profile". The mode can change
  // while its data is open, so that name follows the mode.
  const named = (key: string, label: string) =>
    key === selectedKey ? "Profile" : key === "insight" ? data : label;
  const above = crumbsAbove(nav.path).map((crumb) => ({
    ...crumb,
    label: named(crumb.key, crumb.label),
  }));
  const levelMode = nav.top ? modeOfLevel(nav.top) : undefined;

  return (
    <StackCrumbs
      crumbs={above}
      here={nav.top ? named(entryKey(nav.top), entryLabel(nav.top)) : ""}
      onPop={(index) => nav.popTo(above[index].keep)}
      onBack={nav.back}
      action={
        <>
          {levelMode ? <ShowOnMap mode={levelMode.mode} label={levelMode.label} /> : null}
          {expand}
        </>
      }
    />
  );
}

/** Only borders have a history in the save, so other values are from its date. */
function SaveDateNote() {
  const live = useEu5TimelineLive();
  const saveDate = useEu5SaveDate();
  // One wrapper on every date, so a step across the save date keeps the level.
  // The status stays mounted, so it is announced when the note appears.
  return (
    <div role="status">
      {!live ? (
        <Note>
          Values are from the save date,{" "}
          <span className="font-game-num text-game-ink-300 tabular-nums">
            {formatLongDate(saveDate)}
          </span>
        </Note>
      ) : null}
    </div>
  );
}

/** The space between the end of an expanded level and the map inset */
const INSET_GAP = 16;

/**
 * How far the end of an expanded level must scroll to clear the map inset.
 * The value is measured, so it follows the inset if its height changes.
 */
function useMapInsetClearance(expanded: boolean, column: React.RefObject<HTMLElement | null>) {
  const [clearance, setClearance] = useState(0);

  useLayoutEffect(() => {
    if (!expanded) return;
    const inset = document.querySelector<HTMLElement>("[data-map-surface]");
    if (!inset) return;
    const measure = () => {
      const bottom = column.current?.getBoundingClientRect().bottom;
      if (bottom === undefined) return;
      setClearance(Math.round(bottom - inset.getBoundingClientRect().top) + INSET_GAP);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inset);
    return () => observer.disconnect();
  }, [expanded, column]);

  return clearance;
}

/**
 * Publish how much of the map the column covers, so the camera and the
 * overlays on the map stand clear of it. The value is measured, because the
 * width glides between levels.
 */
function useColumnInset(width: number, expanded: boolean) {
  const ref = useRef<HTMLElement>(null);
  const setInset = useSetEu5ColumnInset();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => {
      const rect = el.getBoundingClientRect();
      const parent = el.offsetParent?.getBoundingClientRect();
      if (!parent) return;
      // A column that spans the frame docks to the bottom edge, as on a phone.
      const docked = rect.width >= parent.width - 1 && rect.top > parent.top + 1;
      setInset(
        docked
          ? { left: 0, bottom: Math.round(parent.bottom - rect.top) }
          : { left: Math.round(rect.right - parent.left), bottom: 0 },
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, [setInset, width, expanded]);

  return ref;
}
