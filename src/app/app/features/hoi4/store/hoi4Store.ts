import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { Hoi4EventKind, Hoi4Metadata, MapMatch, MapMode } from "../worker/types";
import type { Entity } from "../view/model";
import { entityKey } from "../view/model";
import { pushLevel } from "@/features/stack";
import { check } from "@/lib/isPresent";

type Hoi4StateInit = {
  meta: Hoi4Metadata;
  input: File;
};

/** What the pointer is over: a key that lights matching rows, and its land */
export type Hover = { key: string; match: MapMatch | null; fromMap?: boolean } | null;

type Hoi4State = Hoi4StateInit & {
  mode: MapMode;
  /** The open levels, outermost first. Empty shows the mode's key. */
  path: Entity[];
  /** A wide level takes the whole frame */
  expanded: boolean;
  hover: Hover;
  /** The event kinds that the chronology and the time bar show */
  kinds: ReadonlySet<Hoi4EventKind>;
  actions: {
    setMode: (mode: MapMode) => void;
    open: (entity: Entity) => void;
    /** Start a new path, as a map click does */
    openPath: (path: Entity[]) => void;
    /** Keep the first `length` levels */
    popTo: (length: number) => void;
    setExpanded: (expanded: boolean) => void;
    setHover: (hover: Hover) => void;
    toggleKind: (kind: Hoi4EventKind) => void;
  };
};

const ALL_KINDS: Hoi4EventKind[] = ["war", "capitulation", "faction", "sinking"];

export const createHoi4Store = ({ meta, input }: Hoi4StateInit) => {
  return createStore<Hoi4State>()((set) => ({
    meta,
    input,
    mode: "political",
    path: [],
    expanded: false,
    hover: null,
    kinds: new Set(ALL_KINDS),
    actions: {
      setMode: (mode) => set({ mode, path: [], expanded: false, hover: null }),
      open: (entity) => set((s) => ({ path: pushLevel(s.path, entity, entityKey), hover: null })),
      openPath: (path) => set({ path, expanded: false, hover: null }),
      popTo: (length) => set((s) => ({ path: s.path.slice(0, length), hover: null })),
      setExpanded: (expanded) => set({ expanded }),
      setHover: (hover) => set({ hover }),
      toggleKind: (kind) =>
        set((s) => {
          const kinds = new Set(s.kinds);
          if (kinds.has(kind)) {
            // At least one kind stays on, so the chronology is never blank
            // by accident.
            if (kinds.size > 1) kinds.delete(kind);
          } else {
            kinds.add(kind);
          }
          return { kinds };
        }),
    },
  }));
};

export type Hoi4Store = StoreApi<Hoi4State>;
export const Hoi4SaveContext = createContext<Hoi4Store | null>(null);
export function useHoi4Context() {
  return check(useContext(Hoi4SaveContext), "Missing Hoi4 Save Context");
}

function useHoi4Store<T>(selector: (state: Hoi4State) => T): T {
  return useStore(useHoi4Context(), selector);
}

export const hoi4 = {
  useMeta: () => useHoi4Store((x) => x.meta),
  useSaveInput: () => useHoi4Store((x) => x.input),
  useMode: () => useHoi4Store((x) => x.mode),
  usePath: () => useHoi4Store((x) => x.path),
  useExpanded: () => useHoi4Store((x) => x.expanded),
  useHover: () => useHoi4Store((x) => x.hover),
  useHoverKey: () => useHoi4Store((x) => x.hover?.key ?? null),
  useKinds: () => useHoi4Store((x) => x.kinds),
  useActions: () => useHoi4Store((x) => x.actions),
};
