import type React from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ActiveProfileIdentity, LensItem } from "@/wasm/wasm_eu5";
import { useEu5MapMode, useEu5SelectionState, useEu5UserSelectionRevision } from "../../store";
import { parentOf } from "../../control-panel/modeConfig";
import { isBuildingList } from "../../stack/buildingList";
import { COMPARE_MAX, isCountrySet, selectionName } from "../../stack/selection";
import type { SelectionLike } from "../../stack/selection";

/** The parts of a profile that open as a level of their own */
export type ProfileSection =
  | "religion"
  | "population"
  | "locations"
  | "diplomacy"
  | "buildings"
  | "members"
  | "goods";

/**
 * One level of the column. The map's caption is the root and is not an
 * entry: a selection narrows the caption, and it does not replace it.
 */
export type PanelNavEntry =
  | { kind: "insight"; label: string }
  | { kind: "compare"; label: string }
  | { kind: "lens"; item: LensItem; label: string }
  | { kind: "profile"; profile: ActiveProfileIdentity; label: string }
  | { kind: "focus"; profile: Extract<ActiveProfileIdentity, { kind: "location" }>; label: string }
  | { kind: "section"; profile: ActiveProfileIdentity; section: ProfileSection; label: string };

/** The countries of the selection side by side */
export const compareEntry: PanelNavEntry = { kind: "compare", label: "Compare" };

export function locationProfileEntry(locationIdx: number, label: string): PanelNavEntry {
  return {
    kind: "focus",
    profile: { kind: "location", location: { key: locationIdx, name: label } },
    label,
  };
}

export function countryProfileEntry(countryIdx: number, label: string): PanelNavEntry {
  return {
    kind: "profile",
    profile: { kind: "country", country: { key: countryIdx, name: label } },
    label,
  };
}

export function marketProfileEntry(marketId: number, label: string): PanelNavEntry {
  return {
    kind: "profile",
    profile: { kind: "market", market: { key: marketId, name: label } },
    label,
  };
}

export function entityProfileEntry(
  kind: "country" | "market",
  id: number,
  label: string,
): PanelNavEntry {
  return kind === "market" ? marketProfileEntry(id, label) : countryProfileEntry(id, label);
}

export function sectionEntry(
  profile: ActiveProfileIdentity,
  section: ProfileSection,
  label: string,
): PanelNavEntry {
  return { kind: "section", profile, section, label };
}

export function profileKey(profile: ActiveProfileIdentity): string {
  if (profile.kind === "country") return `country:${profile.country.key}`;
  if (profile.kind === "market") return `market:${profile.market.key}`;
  return `location:${profile.location.key}`;
}

/** The identity of a level. The path never holds two levels with one key. */
export function entryKey(entry: PanelNavEntry): string {
  if (entry.kind === "insight") return "insight";
  if (entry.kind === "compare") return "compare";
  if (entry.kind === "lens")
    return `lens:${entry.item.kind}:${"key" in entry.item ? entry.item.key : ""}`;
  if (entry.kind === "section") return `${profileKey(entry.profile)}/${entry.section}`;
  return profileKey(entry.profile);
}

/** The profile a level shows, if it shows one */
export function entryProfile(entry: PanelNavEntry | undefined): ActiveProfileIdentity | null {
  if (
    entry === undefined ||
    entry.kind === "insight" ||
    entry.kind === "compare" ||
    entry.kind === "lens"
  ) {
    return null;
  }
  return entry.profile;
}

/** The name of a profile */
function profileName(profile: ActiveProfileIdentity): string {
  if (profile.kind === "country") return profile.country.name;
  if (profile.kind === "market") return profile.market.name;
  return profile.location.name;
}

/** The name of a level in the path */
export function entryLabel(entry: PanelNavEntry): string {
  // The root crumb names the mode, so the insight takes the name of the
  // button that opens it. With the mode's title, "Control" shows two times.
  return entry.kind === "insight" ? "Details" : entry.label;
}

/** One crumb above the open level, and the levels that stay when it is clicked */
export type PathCrumb = { key: string; label: string; keep: number };

/** The selection as a crumb, or null with nothing selected */
export function selectionCrumb(
  selection: SelectionLike | null | undefined,
): Omit<PathCrumb, "keep"> | null {
  if (selection == null || selection.isEmpty) return null;
  const profile = selection.preset === "players" ? undefined : selection.activeProfile;
  return profile
    ? { key: profileKey(profile), label: profileName(profile) }
    : { key: "selection", label: selectionName(selection) };
}

/**
 * The crumbs above the open level, in one hierarchy: the selection, then the
 * levels. The caption is the selection's own level, so its crumb goes there. A
 * location opens its parts from the caption, so the entity of a part can have
 * no level of its own. The path names that entity, and a click on it goes back
 * to the level that heads it. A selection that has a level in the path has its
 * crumb from that level.
 */
export function crumbsAbove(
  path: readonly PanelNavEntry[],
  selected: Omit<PathCrumb, "keep"> | null = null,
): PathCrumb[] {
  const crumbs: PathCrumb[] = [];
  path.forEach((entry, at) => {
    if (entry.kind === "section") {
      const key = profileKey(entry.profile);
      const named = path.slice(0, at).some((x) => {
        const profile = entryProfile(x);
        return profile !== null && profileKey(profile) === key;
      });
      if (!named) crumbs.push({ key, label: profileName(entry.profile), keep: at });
    }
    if (at < path.length - 1) {
      crumbs.push({ key: entryKey(entry), label: entryLabel(entry), keep: at + 1 });
    }
  });
  const named = path.some((entry) => {
    const profile = entryProfile(entry);
    return profile !== null && profileKey(profile) === selected?.key;
  });
  return selected && !named ? [{ ...selected, keep: 0 }, ...crumbs] : crumbs;
}

/** What the selection is, apart from the revision that reported it */
export function selectionIdentity(selection: SelectionLike | null | undefined): string {
  if (selection == null || selection.isEmpty) return "none";
  const profile = selection.activeProfile ? profileKey(selection.activeProfile) : "-";
  return `${selection.preset ?? "-"}|${profile}|${selection.entityCount}|${selection.locationCount}`;
}

/**
 * Open `entry` on top of `path`. An entry that is already in the path is
 * not added again: the path goes back to it.
 */
export function openOnPath(path: PanelNavEntry[], entry: PanelNavEntry): PanelNavEntry[] {
  const key = entryKey(entry);
  const at = path.findIndex((x) => entryKey(x) === key);
  return at >= 0 ? path.slice(0, at + 1) : [...path, entry];
}

/** What changed since the path was last made */
export type PathChange = {
  /** Another parent mode is open */
  modeChanged: boolean;
  /** The reader made a different selection */
  selectionChanged: boolean;
  /** The selection after the change */
  selection: SelectionLike | null | undefined;
  /** A level that a select-and-open asked for, until its selection arrives */
  pending: PanelNavEntry | null;
  /** The reader is adding countries from a list, so the list stays */
  keepList?: boolean;
};

/**
 * The path after a change of mode or selection.
 *
 * - A new selection starts a new path. A select-and-open keeps its level
 *   when the new selection is the entity of that level. The Compare level
 *   stays while the selection is still a set of countries.
 * - Another parent mode closes only the levels of the mode (the insight
 *   and the levels above it). Profiles, their sections, and Compare do not
 *   change with the mode, so they stay.
 */
/** A few countries that the reader chose. A preset or a large area stays a list. */
function opensOnCompare(selection: PathChange["selection"]): boolean {
  return (
    selection != null &&
    isCountrySet(selection) &&
    selection.preset !== "players" &&
    !selection.scopeDisplayName &&
    selection.entityCount <= COMPARE_MAX
  );
}

export function nextPath(path: PanelNavEntry[], change: PathChange): PanelNavEntry[] {
  let next = path;
  if (change.selectionChanged) {
    const active = change.selection?.isEmpty ? undefined : change.selection?.activeProfile;
    const pending = entryProfile(change.pending ?? undefined);
    if (change.pending && pending && active && profileKey(pending) === profileKey(active)) {
      next = [change.pending];
    } else if (next[0]?.kind === "compare" && isCountrySet(change.selection)) {
      next = [next[0]];
    } else if (opensOnCompare(change.selection) && !change.keepList) {
      // A few chosen countries are a question about those countries.
      next = [compareEntry];
    } else {
      next = [];
    }
  }
  if (change.modeChanged) {
    const insight = next.findIndex((x) => x.kind === "insight" || x.kind === "lens");
    if (insight >= 0) next = next.slice(0, insight);
  }
  return next;
}

interface PanelNavApi {
  /** The open levels, outermost first. Empty when the caption shows. */
  path: PanelNavEntry[];
  top: PanelNavEntry | undefined;
  open: (entry: PanelNavEntry) => void;
  /**
   * Open `entry` as the first level for a selection that is on its way.
   * When the selection arrives, the path keeps the level, so the selection
   * and the open profile agree.
   */
  openForSelection: (entry: PanelNavEntry) => void;
  /** Keep the first `length` levels. Zero returns to the caption. */
  popTo: (length: number) => void;
  /**
   * Remove the top level. Return false at the caption: then Esc goes on
   * to the map, which clears the selection.
   */
  back: () => boolean;
}

/** The path after one step back, or null at the caption */
export function backFrom(path: PanelNavEntry[]): PanelNavEntry[] | null {
  return path.length === 0 ? null : path.slice(0, -1);
}

/**
 * True if the column can use this Esc key to go up one level. A menu, a
 * dialog or the search that uses the key first prevents its default, and
 * a key in a text field belongs to that field.
 */
export function isColumnEscape(event: {
  key: string;
  defaultPrevented: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | { tagName?: string; isContentEditable?: boolean } | null;
}): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (target?.isContentEditable) return false;
  return !TEXT_FIELDS.has(target?.tagName ?? "");
}

const TEXT_FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const PanelNavContext = createContext<PanelNavApi | null>(null);

export function usePanelNav(): PanelNavApi {
  const ctx = useContext(PanelNavContext);
  if (!ctx) throw new Error("usePanelNav must be used within PanelNavProvider");
  return ctx;
}

/**
 * The path of the column. The caption is its root, and the reader's steps
 * follow it. A new selection narrows the caption and starts a new path.
 */
export function PanelNavProvider({ children }: { children: React.ReactNode }) {
  const selection = useEu5SelectionState();
  const [steps, setSteps] = useState<PanelNavEntry[]>([]);
  const [pending, setPending] = useState<PanelNavEntry | null>(null);

  // The worker also reports the selection again after a mode change, so a
  // new revision is a new selection only when the selection itself is
  // different. A variant of the same mode is not a mode change, so a level
  // can hand off to its sibling view.
  const mode = parentOf(useEu5MapMode()).key;
  const userSelectionRevision = useEu5UserSelectionRevision();
  const identity = selectionIdentity(selection);
  const [previous, setPrevious] = useState({ revision: userSelectionRevision, identity, mode });
  const modeChanged = previous.mode !== mode;
  const selectionChanged =
    previous.revision !== userSelectionRevision && previous.identity !== identity;
  const moved = previous.revision !== userSelectionRevision || modeChanged;
  const restarted = modeChanged || selectionChanged;
  const next = restarted
    ? nextPath(steps, {
        modeChanged,
        selectionChanged,
        selection,
        pending,
        keepList: isBuildingList(),
      })
    : steps;
  if (moved) {
    setPrevious({ revision: userSelectionRevision, identity, mode });
    if (restarted) setSteps(next);
    if (selectionChanged && pending) setPending(null);
  }

  const path = next;

  const open = useCallback((entry: PanelNavEntry) => setSteps(openOnPath(path, entry)), [path]);
  const openForSelection = useCallback((entry: PanelNavEntry) => {
    setSteps([entry]);
    setPending(entry);
  }, []);
  const popTo = useCallback((length: number) => setSteps((s) => s.slice(0, length)), []);
  const back = useCallback(() => {
    const next = backFrom(path);
    if (next === null) return false;
    setSteps(next);
    return true;
  }, [path]);

  const api = useMemo<PanelNavApi>(
    () => ({ path, top: path[path.length - 1], open, openForSelection, popTo, back }),
    [path, open, openForSelection, popTo, back],
  );

  return <PanelNavContext.Provider value={api}>{children}</PanelNavContext.Provider>;
}
