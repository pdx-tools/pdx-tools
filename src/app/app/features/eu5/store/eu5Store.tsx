import { check } from "@/lib/isPresent";
import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import { isTimelineLive } from "../ui-engine";
import type { AppEngine, AppState } from "../ui-engine";
import type { Eu5DateComponents, Eu5PlayerData, WorldSummary } from "@/wasm/wasm_eu5";
import type { Eu5ParsedSave } from "./types";

type Eu5State = {
  engine: AppEngine;
  appState: AppState;
  filename: string;
  saveInput: Eu5ParsedSave;
  saveDate: Eu5DateComponents;
  playthroughName: string;
  /** Human players in save order. Empty for observer games. */
  players: Eu5PlayerData[];
  /** The whole map: the scope of every insight when nothing is selected. */
  world: WorldSummary;
  insightPanelOpen: boolean;
  insightPanelWidth: number;
  setInsightPanelOpen: (open: boolean) => void;
  setInsightPanelWidth: (width: number) => void;
  /** Height of the timeline bar over the map, so overlays can sit above it. */
  timelineBarHeight: number;
  setTimelineBarHeight: (height: number) => void;
  /**
   * The permalink id once this save is shared. A save opened from a
   * permalink is shared from the start; a local file becomes shared when the
   * upload lands, and the share button keeps offering the link after that.
   */
  sharedSaveId: string | null;
  setSharedSaveId: (id: string) => void;
};

export type Eu5Store = StoreApi<Eu5State>;

export const Eu5Context = createContext<Eu5Store | null>(null);

export const createEu5Store = (
  engine: AppEngine,
  saveInput: Eu5ParsedSave,
  filename: string,
  saveDate: Eu5DateComponents,
  playthroughName: string,
  players: Eu5PlayerData[],
  world: WorldSummary,
): Eu5Store => {
  const store = createStore<Eu5State>()((set) => ({
    engine,
    saveInput,
    appState: engine.getState(),
    filename,
    saveDate,
    playthroughName,
    players,
    world,
    insightPanelOpen: false,
    insightPanelWidth: 640,
    timelineBarHeight: 0,
    setInsightPanelOpen: (open) => set({ insightPanelOpen: open }),
    setInsightPanelWidth: (width) => set({ insightPanelWidth: width }),
    setTimelineBarHeight: (height) => set({ timelineBarHeight: height }),
    sharedSaveId: saveInput.kind === "server" ? saveInput.saveId : null,
    setSharedSaveId: (id) => set({ sharedSaveId: id }),
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
export const useEu5MapModeGradient = () => useEu5Store((x) => x.appState.mapModeGradient);
export const useEu5PaletteGradients = () => useEu5Store((x) => x.appState.paletteGradients);
export const useEu5BoxSelectRect = () => useEu5Store((x) => x.appState.boxSelectRect);
export const useEu5CursorHint = () => useEu5Store((x) => x.appState.cursorHint);
export const useSaveFilename = () => useEu5Store((x) => x.filename);
export const useEu5SaveInput = () => useEu5Store((x) => x.saveInput);
export const useEu5SaveDate = () => useEu5Store((x) => x.saveDate);
export const useEu5World = () => useEu5Store((x) => x.world);
export const useEu5PlaythroughName = () => useEu5Store((x) => x.playthroughName);
export const useEu5Players = () => useEu5Store((x) => x.players);
export const useEu5SelectionState = () => useEu5Store((x) => x.appState.selectionState);
export const useEu5SelectionRevision = () => useEu5Store((x) => x.appState.selectionRevision);
export const useEu5InsightPanelOpen = () => useEu5Store((x) => x.insightPanelOpen);
export const useEu5InsightPanelWidth = () => useEu5Store((x) => x.insightPanelWidth);
export const useSetEu5InsightPanelOpen = () => useEu5Store((x) => x.setInsightPanelOpen);
export const useSetEu5InsightPanelWidth = () => useEu5Store((x) => x.setInsightPanelWidth);
export const useEu5Timeline = () => useEu5Store((x) => x.appState.timeline);
export const useEu5TimelineDate = () => useEu5Store((x) => x.appState.timelineDate);
export const useEu5TimelineMapDate = () => useEu5Store((x) => x.appState.timelineMapDate);
export const useEu5TimelineLive = () => useEu5Store((x) => isTimelineLive(x.appState));
export const useEu5TimelinePlayback = () => useEu5Store((x) => x.appState.timelinePlayback);
export const useEu5Timelapse = () => useEu5Store((x) => x.appState.timelapse);
export const useEu5MapViewport = () => useEu5Store((x) => x.appState.mapViewport);
export const useEu5TimelineBarHeight = () => useEu5Store((x) => x.timelineBarHeight);
export const useSetEu5TimelineBarHeight = () => useEu5Store((x) => x.setTimelineBarHeight);
export const useEu5SharedSaveId = () => useEu5Store((x) => x.sharedSaveId);
export const useSetEu5SharedSaveId = () => useEu5Store((x) => x.setSharedSaveId);
