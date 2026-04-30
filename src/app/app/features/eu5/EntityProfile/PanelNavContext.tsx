import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import { useEu5SelectionRevision } from "../store";

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
  return { kind: "focus", profile: { kind: "location", location_idx: locationIdx, label }, label };
}

export function countryProfileEntry(anchorLocationIdx: number, label: string): PanelNavEntry {
  return {
    kind: "profile",
    profile: { kind: "country", anchor_location_idx: anchorLocationIdx, label },
    label,
  };
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
  const prevRevisionRef = useRef(selectionRevision);
  const selectionChanged = prevRevisionRef.current !== selectionRevision;
  const effectiveStack = selectionChanged ? EMPTY_STACK : stack;
  const effectiveRootLabel = selectionChanged ? undefined : rootLabel;

  useEffect(() => {
    if (prevRevisionRef.current !== selectionRevision) {
      prevRevisionRef.current = selectionRevision;
      setStack([]);
      setRootLabel(undefined);
    }
  }, [selectionRevision]);

  const pushMany = useCallback((entries: PanelNavEntry[], nextRootLabel?: string) => {
    if (nextRootLabel != null) {
      setRootLabel(nextRootLabel);
    }
    setStack((s) => [...s, ...entries]);
  }, []);

  const popTo = useCallback((length: number) => {
    setStack((s) => s.slice(0, length));
  }, []);

  const reset = useCallback(() => {
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
