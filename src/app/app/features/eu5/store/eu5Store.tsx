import { check } from "@/lib/isPresent";
import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { AppEngine, AppState } from "../ui-engine";
import type { Eu5DateComponents } from "@/wasm/wasm_eu5";

type Eu5State = {
  engine: AppEngine;
  appState: AppState;
  filename: string;
  saveDate: Eu5DateComponents;
  playthroughName: string;
  insightPanelOpen: boolean;
  insightPanelWidth: number;
  setInsightPanelOpen: (open: boolean) => void;
  setInsightPanelWidth: (width: number) => void;
};

export type Eu5Store = StoreApi<Eu5State>;

export const Eu5Context = createContext<Eu5Store | null>(null);

export const createEu5Store = (
  engine: AppEngine,
  filename: string,
  saveDate: Eu5DateComponents,
  playthroughName: string,
): Eu5Store => {
  const store = createStore<Eu5State>()((set) => ({
    engine,
    appState: engine.getState(),
    filename,
    saveDate,
    playthroughName,
    insightPanelOpen: false,
    insightPanelWidth: 640,
    setInsightPanelOpen: (open) => set({ insightPanelOpen: open }),
    setInsightPanelWidth: (width) => set({ insightPanelWidth: width }),
  }));

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
export const useEu5MapMode = () => useEu5Store((x) => x.appState.currentMapMode);
export const useEu5HoverData = () => useEu5Store((x) => x.appState.hoverDisplayData);
export const useEu5OwnerBorders = () => useEu5Store((x) => x.appState.ownerBordersEnabled);
export const useEu5IsGeneratingScreenshot = () =>
  useEu5Store((x) => x.appState.isGeneratingScreenshot);
export const useEu5MapModeRange = () => useEu5Store((x) => x.appState.mapModeRange);
export const useEu5BoxSelectRect = () => useEu5Store((x) => x.appState.boxSelectRect);
export const useEu5CursorHint = () => useEu5Store((x) => x.appState.cursorHint);
export const useSaveFilename = () => useEu5Store((x) => x.filename);
export const useEu5SaveDate = () => useEu5Store((x) => x.saveDate);
export const useEu5PlaythroughName = () => useEu5Store((x) => x.playthroughName);
export const useEu5SelectionState = () => useEu5Store((x) => x.appState.selectionState);
export const useEu5SelectionRevision = () => useEu5Store((x) => x.appState.selectionRevision);
export const useEu5InsightPanelOpen = () => useEu5Store((x) => x.insightPanelOpen);
export const useEu5InsightPanelWidth = () => useEu5Store((x) => x.insightPanelWidth);
export const useSetEu5InsightPanelOpen = () => useEu5Store((x) => x.setInsightPanelOpen);
export const useSetEu5InsightPanelWidth = () => useEu5Store((x) => x.setInsightPanelWidth);
