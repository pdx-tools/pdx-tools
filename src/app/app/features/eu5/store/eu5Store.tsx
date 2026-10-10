import { check } from "@/lib/isPresent";
import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import { isTimelineLive } from "../ui-engine";
import type { AppEngine, AppState } from "../ui-engine";
import type { Eu5DateComponents, Eu5PlayerData, WorldSummary } from "@/wasm/wasm_eu5";
import type { Eu5ParsedSave, Eu5SaveInput } from "./types";
import type { OpenedSave } from "../ui-engine";

type Eu5State = {
  engine: AppEngine;
  appState: AppState;
  filename: string;
  /** The save as the page got it. A file handle stays a handle. */
  input: Eu5SaveInput;
  saveInput: Eu5ParsedSave;
  saveDate: Eu5DateComponents;
  /** The id that every save of the campaign carries. */
  playthroughId: string;
  playthroughName: string;
  /** More than one human player, as the server counts it for the campaign key. */
  multiplayer: boolean;
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
   * The permalink id of a local save that this session uploaded. It is in
   * the store and not in the share row, so the row keeps offering the link
   * if it remounts. A save opened from its permalink has its id in
   * `saveInput`.
   */
  uploadedSaveId: string | null;
  setUploadedSaveId: (id: string) => void;
};

export type Eu5Store = StoreApi<Eu5State>;

export const Eu5Context = createContext<Eu5Store | null>(null);

/** The view of the page, which a step to the next save of the campaign keeps. */
type Eu5ViewState = Pick<Eu5State, "insightPanelOpen" | "insightPanelWidth" | "timelineBarHeight">;

export const createEu5Store = ({
  opened,
  input,
  saveInput,
  view,
}: {
  opened: OpenedSave;
  input: Eu5SaveInput;
  saveInput: Eu5ParsedSave;
  /** The view that the previous save of the campaign left. */
  view?: Partial<Eu5ViewState>;
}): Eu5Store => {
  const { engine } = opened;
  const filename = saveInput.kind === "file" ? saveInput.file.name : saveInput.name;
  const store = createStore<Eu5State>()((set) => ({
    engine,
    input,
    saveInput,
    appState: engine.getState(),
    filename,
    saveDate: opened.saveDate,
    playthroughId: opened.playthroughId,
    playthroughName: opened.playthroughName,
    multiplayer: opened.multiplayer,
    players: opened.players,
    world: opened.world,
    insightPanelOpen: view?.insightPanelOpen ?? false,
    insightPanelWidth: view?.insightPanelWidth ?? 640,
    timelineBarHeight: view?.timelineBarHeight ?? 0,
    setInsightPanelOpen: (open) => set({ insightPanelOpen: open }),
    setInsightPanelWidth: (width) => set({ insightPanelWidth: width }),
    setTimelineBarHeight: (height) => set({ timelineBarHeight: height }),
    uploadedSaveId: null,
    setUploadedSaveId: (id) => set({ uploadedSaveId: id }),
  }));

  engine.subscribe((appState) => {
    store.setState({ appState });
  });

  return store;
};

/** The view state of a store, for the store of the next save of the campaign. */
export function eu5ViewState(store: Eu5Store): Eu5ViewState {
  const { insightPanelOpen, insightPanelWidth, timelineBarHeight } = store.getState();
  return { insightPanelOpen, insightPanelWidth, timelineBarHeight };
}

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
export const useEu5Input = () => useEu5Store((x) => x.input);
export const useEu5SaveDate = () => useEu5Store((x) => x.saveDate);
export const useEu5World = () => useEu5Store((x) => x.world);
export const useEu5PlaythroughId = () => useEu5Store((x) => x.playthroughId);
export const useEu5PlaythroughName = () => useEu5Store((x) => x.playthroughName);
export const useEu5Players = () => useEu5Store((x) => x.players);
export const useEu5Multiplayer = () => useEu5Store((x) => x.multiplayer);
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
export const useEu5UploadedSaveId = () => useEu5Store((x) => x.uploadedSaveId);
export const useSetEu5UploadedSaveId = () => useEu5Store((x) => x.setUploadedSaveId);
