import { StoreApi, create, useStore } from "zustand";
import { Vic3Metadata } from "../worker/types";
import { createContext, useContext } from "react";
import { check } from "@/lib/isPresent";

type Vic3StateProps = {
  save: {
    meta: Vic3Metadata;
    filename: string;
  };
};
type Vic3State = Vic3StateProps;

export type Vic3Store = StoreApi<Vic3State>;
export const Vic3SaveContext = createContext<Vic3Store | null>(null);

export const createVic3Store = async ({ save }: Vic3StateProps) => {
  return create<Vic3State>()((set, get) => ({
    save,
  }));
};

export function useVic3Context() {
  return check(useContext(Vic3SaveContext), "Missing Vic3 Save Context");
}

const useVic3Store = <T>(selector: (state: Vic3State) => T): T =>
  useStore(useVic3Context(), selector);
export const useVic3Meta = () => useVic3Store((x) => x.save.meta);
export const useSaveFilename = () => useVic3Store((x) => x.save.filename);
