import { check } from "@/lib/isPresent";
import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { AppEngine, AppState } from "../ui-engine";

type Eu5State = {
  engine: AppEngine;
  appState: AppState;
  filename: string;
};

export type Eu5Store = StoreApi<Eu5State>;

export const Eu5Context = createContext<Eu5Store | null>(null);

export const createEu5Store = (
  engine: AppEngine,
  filename: string,
): Eu5Store => {
  const store = createStore<Eu5State>()(() => ({
    engine,
    appState: engine.getState(),
    filename,
  }));

  // Subscribe to engine state changes
  engine.subscribe((appState) => {
    store.setState({ appState });
  });

  return store;
};

export function useEu5Context() {
  return check(useContext(Eu5Context), "Missing EU5 Context");
}

export function useInEu5Analysis() {
  return useContext(Eu5Context) != undefined;
}

const useEu5Store = <T,>(selector: (state: Eu5State) => T): T =>
  useStore(useEu5Context(), selector);

export const useEu5Engine = () => useEu5Store((x) => x.engine);
export const useEu5AppState = () => useEu5Store((x) => x.appState);
export const useEu5MapMode = () =>
  useEu5Store((x) => x.appState.currentMapMode);
export const useEu5HoverData = () =>
  useEu5Store((x) => x.appState.hoverDisplayData);
export const useEu5OwnerBorders = () =>
  useEu5Store((x) => x.appState.ownerBordersEnabled);
export const useEu5IsGeneratingScreenshot = () =>
  useEu5Store((x) => x.appState.isGeneratingScreenshot);
export const useEu5MapModeRange = () =>
  useEu5Store((x) => x.appState.mapModeRange);
export const useSaveFilename = () => useEu5Store((x) => x.filename);
