import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { Hoi4Metadata } from "../worker/types";
import { check } from "@/lib/isPresent";

type Hoi4StateInit = {
  meta: Hoi4Metadata;
  input: File;
};

type Hoi4State = Hoi4StateInit & {
  /** The country that the panel describes and the map highlights */
  selectedTag: string | undefined;
  actions: {
    selectCountry: (tag: string | undefined) => void;
  };
};

export const createHoi4Store = ({ meta, input }: Hoi4StateInit) => {
  return createStore<Hoi4State>()((set) => ({
    meta,
    input,
    selectedTag: meta.player ?? meta.countries[0],
    actions: {
      selectCountry: (tag) => set({ selectedTag: tag }),
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
  useSelectedTag: () => useHoi4Store((x) => x.selectedTag),
  useActions: () => useHoi4Store((x) => x.actions),
};
