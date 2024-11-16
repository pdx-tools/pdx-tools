import { createContext, useContext } from "react";
import { StoreApi, createStore, useStore } from "zustand";
import { Hoi4Metadata } from "../worker/types";
import { check } from "@/lib/isPresent";

type Hoi4StateInit = {
  meta: Hoi4Metadata;
  input: File;
};

type Hoi4State = Hoi4StateInit;

export const createHoi4Store = ({ meta, input }: Hoi4StateInit) => {
  return createStore<Hoi4State>()((_set, _get) => ({
    meta,
    input,
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
};
