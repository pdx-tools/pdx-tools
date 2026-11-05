import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import ArrowsPointingOutIcon from "@heroicons/react/16/solid/ArrowsPointingOutIcon";
import ArrowsPointingInIcon from "@heroicons/react/16/solid/ArrowsPointingInIcon";
import { focusRing } from "@/components/game/focusRing";
import { formatLongDate } from "@/features/timeline/date";
import {
  useEu5BoxSelectRect,
  useEu5Engine,
  useEu5MapMode,
  useEu5MapViewport,
  useEu5Players,
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
import { ColumnHead, rescueFocus } from "./ColumnHead";
import { useViewportInsets } from "../useViewportInsets";
import { SelectedCountriesProvider } from "./selected";
import { LevelView, levelWidth } from "./levels";
import { IconTip, Note, ShowOnMap, StackCrumbs } from "./parts";
import { FullViewContext } from "./fullView";
import { useFigure } from "./figure";
import { useFrameSelection } from "./frameSelection";
import { useCampaignTitle } from "./HomeName";
import { isTypingTarget } from "@/features/timeline/controller";
import { insightLabel } from "./selection";
import { MapBar } from "./MapBar";
import { LevelTabs, rootLabel } from "./LevelTabs";
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
  /** The analysis has the frame, and the map waits behind it */
  expanded: boolean;
}) {
  const preview = useMapHistory()?.preview;
  // A phone has the key at the top of the sheet, so nothing covers the small map.
  const desktop = useBreakpoint("md");
  return (
    <PanelNavProvider>
      <SelectedCountriesProvider>
        <SaveActionsProvider>
          <PageTitle />
          <ColumnFrame onExpand={onExpand} />
          <MapBar />
          {!expanded && !preview && desktop ? <MapKey /> : null}
          {!expanded && !preview ? <MapLabels /> : null}
        </SaveActionsProvider>
      </SelectedCountriesProvider>
    </PanelNavProvider>
  );
}

/** An area that the reader draws is what they want to see, so the map frames it. */
function useFrameAfterBox() {
  const box = useEu5BoxSelectRect();
  const frame = useFrameSelection();
  const drawing = useRef(false);
  useEffect(() => {
    if (box) {
      drawing.current = true;
      return;
    }
    if (!drawing.current) return;
    drawing.current = false;
    // The selection of the area arrives a moment after the end of the drag.
    const timer = setTimeout(frame, BOX_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [box, frame]);
}

const BOX_SETTLE_MS = 400;

/** A save opens one time on the players, and "All" then stays until the next save. */
const openedOnPlayers = new WeakSet<object>();

/**
 * A group's save is about the group, so it opens on the players. The map then lights
 * their land, and each player has a name on it.
 */
function useOpenOnPlayers() {
  const engine = useEu5Engine();
  const players = useEu5Players();
  const selection = useEu5SelectionState();
  const empty = selection == null || selection.isEmpty;
  const frame = useFrameSelection();
  useEffect(() => {
    if (players.length < 2 || !empty || openedOnPlayers.has(engine)) return;
    openedOnPlayers.add(engine);
    void engine.commands.selectPlayers().then(frame);
  }, [engine, players.length, empty, frame]);
}

/**
 * Focus has a defined place at each step between levels: a new level has its heading, and
 * a step back has the row that opened the level.
 */
function useLevelFocus(topKey: string | null, depth: number) {
  const lastRow = useRef<string | null>(null);
  const opened = useRef<(string | null)[]>([]);
  const previous = useRef({ topKey, depth });
  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      const key = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-row-key]");
      if (key) lastRow.current = key.dataset.rowKey ?? null;
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);
  useEffect(() => {
    const was = previous.current;
    previous.current = { topKey, depth };
    if (was.topKey === topKey) return;
    const forward = depth > was.depth;
    if (forward) opened.current.push(lastRow.current);
    const back = depth < was.depth ? opened.current.pop() : undefined;
    const timer = setTimeout(() => {
      // A reader who is already somewhere stays there.
      if (document.activeElement !== document.body) return;
      const row =
        back && document.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(back)}"]`);
      if (row) {
        row.focus();
        return;
      }
      const body = document.querySelector<HTMLElement>("[data-column-body]");
      const heading = body?.querySelector<HTMLElement>("h2, p");
      const target = heading ?? body;
      if (target) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    }, LEVEL_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [topKey, depth]);
}

const LEVEL_SETTLE_MS = 120;

/** After the column stops, and before a frame of the selection, which has the last word */
const RECENTRE_MS = 240;

/**
 * When the column widens over the map, the map moves by half the change, so what was in
 * the middle of the free part stays in the middle of the free part.
 */
function useKeepMapCentred(covering: boolean) {
  const engine = useEu5Engine();
  const { left } = useViewportInsets();
  const viewport = useEu5MapViewport();
  const latest = useRef(viewport);
  // The inset moves in steps while the column glides, so the change counts from its last rest.
  const settled = useRef(left);
  const lastCovering = useRef(covering);
  useEffect(() => {
    latest.current = viewport;
  }, [viewport]);
  useEffect(() => {
    if (left === settled.current && covering === lastCovering.current) return;
    const timer = setTimeout(() => {
      const from = settled.current;
      const wasCovering = lastCovering.current;
      settled.current = left;
      lastCovering.current = covering;
      // The map was behind the column, so it has no middle to keep.
      if (covering || wasCovering) return;
      const view = latest.current?.viewport;
      if (!view) return;
      const shift = (((left - from) / 2) * view.width) / window.innerWidth;
      void engine.trigger.fitWorldRect({ ...view, x: view.x - shift });
    }, RECENTRE_MS);
    return () => clearTimeout(timer);
  }, [engine, left, covering]);
}

/** The page names the save and what it shows, for a tab and for a screen reader. */
function PageTitle() {
  const figure = useFigure();
  const title = useCampaignTitle();
  const mode = parentOf(useEu5MapMode()).label;
  useEffect(() => {
    const before = document.title;
    document.title = `${title}: ${mode} - EU5 - PDX Tools`;
    return () => {
      document.title = before;
    };
  }, [title, mode]);
  return (
    <>
      <h1 className="sr-only">{`${title}. ${figure.title}`}</h1>
      {/* A new mode or selection is said aloud, in the words of the map's title. */}
      <p role="status" className="sr-only">
        {figure.title}
      </p>
    </>
  );
}

function ColumnFrame({ onExpand }: { onExpand: (expanded: boolean) => void }) {
  const nav = usePanelNav();
  const preview = useMapHistory()?.preview;
  const [expanded, setExpanded] = useState(false);
  const width = levelWidth(nav.top);
  // One rule at each size: the full view has the whole frame.
  const covering = expanded;
  const mode = useEu5MapMode();
  const selection = useEu5SelectionState();
  const topKey = nav.top ? entryKey(nav.top) : null;
  const ref = useColumnInset(width, covering);
  const frame = "md:w-(--level-width)";
  const frameWidth = covering ? "100cqw" : `min(${width}px,62cqw)`;
  const empty = selection == null || selection.isEmpty;

  const toggle = useCallback(() => {
    setExpanded((on) => {
      // A list of the world says little more at full width, so the frame goes to its charts.
      if (!on && nav.top === undefined && empty && mode !== "political") {
        const label = insightLabel(parentOf(mode).label);
        nav.open({ kind: "insight", label });
      }
      return !on;
    });
  }, [nav, empty, mode]);
  const fullView = useMemo(() => ({ on: expanded, toggle }), [expanded, toggle]);

  // "M" goes between the map and the full view, from anywhere but a field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "m" && event.key !== "M") return;
      if (isTypingTarget(event.target) || preview) return;
      event.preventDefault();
      toggle();
      rescueFocus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle, preview]);

  useKeepMapCentred(covering);
  useLevelFocus(topKey, nav.path.length);
  useOpenOnPlayers();
  useFrameAfterBox();

  useEffect(() => {
    onExpand(covering);
  }, [covering, onExpand]);

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

  const expand = <FullViewButton expanded={expanded} onToggle={toggle} />;

  return (
    <FullViewContext.Provider value={fullView}>
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
          covering && "md:border-r-0",
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
          <div data-column-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {preview ? (
              <Note>Charts become available when playback pauses and this save has loaded.</Note>
            ) : (
              <div>
                {/* The world list at a past date is true for that date. */}
                {nav.top === undefined && empty && mode === "political" ? null : <SaveDateNote />}
                <LevelView key={topKey ?? "root"} entry={nav.top} />
              </div>
            )}
          </div>
        </div>
      </aside>
    </FullViewContext.Provider>
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

function FullViewButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <IconTip label={expanded ? "Back to the map (M)" : "Give the analysis the whole frame (M)"}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={expanded}
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
        {expanded ? "Exit full view" : "Full view"}
      </button>
    </IconTip>
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
    key === selectedKey ? rootLabel(profile?.kind) : key === "insight" ? data : label;
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
