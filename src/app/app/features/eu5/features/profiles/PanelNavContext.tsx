import { useHistory } from "../../history/store";
import type React from "react";
import { createContext, useCallback, useContext, useMemo, useState, useEffect } from "react";
import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import { useEu5SelectionRevision } from "../../store";

export type PanelNavEntry =
  | { kind: "profile"; profile: ActiveProfileIdentity; label: string }
  | { kind: "focus"; profile: Extract<ActiveProfileIdentity, { kind: "location" }>; label: string };

type ProfileTabKind = ActiveProfileIdentity["kind"];
type ProfileTabs = Record<ProfileTabKind, string>;

export const DEFAULT_PROFILE_TABS: ProfileTabs = {
  country: "overview",
  market: "overview",
  location: "overview",
};

export function setProfileTabValue(
  tabs: ProfileTabs,
  kind: ProfileTabKind,
  value: string,
): ProfileTabs {
  return { ...tabs, [kind]: value };
}

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

interface PanelNavApi {
  stack: PanelNavEntry[];
  rootLabel: string | undefined;
  top: PanelNavEntry | undefined;
  pushMany: (entries: PanelNavEntry[], rootLabel?: string) => void;
  popTo: (length: number) => void;
  reset: () => void;
  profileTabs: ProfileTabs;
  setProfileTab: (kind: ProfileTabKind, value: string) => void;
}

const PanelNavContext = createContext<PanelNavApi | null>(null);
const EMPTY_STACK: PanelNavEntry[] = [];

export function usePanelNav(): PanelNavApi {
  const ctx = useContext(PanelNavContext);
  if (!ctx) throw new Error("usePanelNav must be used within PanelNavProvider");
  return ctx;
}

export function useProfileTab(kind: ProfileTabKind, defaultValue = "overview") {
  const nav = usePanelNav();
  const value = nav.profileTabs[kind] ?? defaultValue;
  const onValueChange = useCallback(
    (nextValue: string) => nav.setProfileTab(kind, nextValue),
    [kind, nav],
  );

  return { value, onValueChange };
}

export function PanelNavProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<PanelNavEntry[]>([]);
  const [rootLabel, setRootLabel] = useState<string | undefined>(undefined);
  const [profileTabs, setProfileTabs] = useState<ProfileTabs>(DEFAULT_PROFILE_TABS);

  const selectionRevision = useEu5SelectionRevision();
  const switchingSave = useHistory((s) => s.switching);
  const [previousSelectionRevision, setPreviousSelectionRevision] = useState(selectionRevision);
  const selectionChanged = previousSelectionRevision !== selectionRevision;
  const resetForSelection = selectionChanged && !switchingSave;
  const remappedProfile = useHistory((s) => s.viewedProfile);
  const effectiveStack = resetForSelection
    ? EMPTY_STACK
    : remappedProfile && stack.length
      ? stack.map((entry, i) =>
          i === stack.length - 1 && entry.profile.kind === remappedProfile.kind
            ? ({ ...entry, profile: remappedProfile } as PanelNavEntry)
            : entry,
        )
      : stack;
  useEffect(() => {
    if (!stack.length) useHistory.getState().setViewedProfile(null);
  }, [stack.length]);
  const effectiveRootLabel = resetForSelection ? undefined : rootLabel;

  if (selectionChanged) {
    setPreviousSelectionRevision(selectionRevision);
    if (!switchingSave) {
      setStack([]);
      setRootLabel(undefined);
    }
  }

  const pushMany = useCallback((entries: PanelNavEntry[], nextRootLabel?: string) => {
    if (nextRootLabel != null) {
      setRootLabel(nextRootLabel);
    }
    useHistory.getState().setViewedProfile(entries.at(-1)?.profile ?? null);
    setStack((s) => [...s, ...entries]);
  }, []);

  const popTo = useCallback(
    (length: number) => {
      useHistory.getState().setViewedProfile(stack.slice(0, length).at(-1)?.profile ?? null);
      setStack((s) => s.slice(0, length));
    },
    [stack],
  );

  const reset = useCallback(() => {
    useHistory.getState().setViewedProfile(null);
    setStack([]);
    setRootLabel(undefined);
  }, []);

  const setProfileTab = useCallback((kind: ProfileTabKind, value: string) => {
    setProfileTabs((tabs) => setProfileTabValue(tabs, kind, value));
  }, []);

  const api = useMemo<PanelNavApi>(
    () => ({
      stack: effectiveStack,
      rootLabel: effectiveRootLabel,
      top: effectiveStack[effectiveStack.length - 1],
      pushMany,
      popTo,
      reset,
      profileTabs,
      setProfileTab,
    }),
    [effectiveStack, effectiveRootLabel, pushMany, popTo, reset, profileTabs, setProfileTab],
  );

  return <PanelNavContext.Provider value={api}>{children}</PanelNavContext.Provider>;
}
