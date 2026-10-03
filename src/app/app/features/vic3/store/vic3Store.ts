import { create, useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { Vic3Metadata } from "../worker/types";
import { createContext, useContext } from "react";
import { check } from "@/lib/isPresent";

type Vic3StateProps = {
  save: {
    meta: Vic3Metadata;
    filename: string;
  };
};
type Vic3State = Vic3StateProps & {
  /** The country that the panel describes and the map highlights */
  selectedTag: string;
  actions: {
    selectCountry: (tag: string) => void;
  };
};

export type Vic3Store = StoreApi<Vic3State>;
export const Vic3SaveContext = createContext<Vic3Store | null>(null);

export const createVic3Store = async ({ save }: Vic3StateProps) => {
  return create<Vic3State>()((set) => ({
    save,
    selectedTag: save.meta.lastPlayedTag,
    actions: {
      selectCountry: (tag) => set({ selectedTag: tag }),
    },
  }));
};

export function useVic3Context() {
  return check(useContext(Vic3SaveContext), "Missing Vic3 Save Context");
}

const useVic3Store = <T>(selector: (state: Vic3State) => T): T =>
  useStore(useVic3Context(), selector);
export const useVic3Meta = () => useVic3Store((x) => x.save.meta);
export const useSaveFilename = () => useVic3Store((x) => x.save.filename);
export const useSelectedTag = () => useVic3Store((x) => x.selectedTag);
export const useVic3Actions = () => useVic3Store((x) => x.actions);
