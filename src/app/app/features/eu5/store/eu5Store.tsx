import { check } from "@/lib/isPresent";
import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import { isTimelineLive } from "../ui-engine";
import type { AppEngine, AppState } from "../ui-engine";
import type { Eu5DateComponents, Eu5PlayerData, WorldSummary } from "@/wasm/wasm_eu5";
import type { Eu5ParsedSave, Eu5SaveInput } from "./types";
import type { OpenedSave } from "../ui-engine";
import type { PlaythroughId } from "@/features/campaign/types";

type Eu5State = {
  engine: AppEngine;
  appState: AppState;
  filename: string;
  /** Retain the original input for future file reads. */
  input: Eu5SaveInput;
  saveInput: Eu5ParsedSave;
  saveDate: Eu5DateComponents;

  playthroughId: PlaythroughId | null;
  playthroughName: string;
  /** Use the server multiplayer rule for campaign grouping. */
  multiplayer: boolean;
  /** Human players in save order. Empty for observer games. */
  players: Eu5PlayerData[];
  /** The country that a save with no human player was written from */
  viewpointCountryIdx: number | null;
  /** The name that the reader gives the campaign, for the header and the images */
  customTitle: string | null;
  setCustomTitle: (title: string) => void;
  /** The country that the reader says is theirs, in a multiplayer save */
  chosenHomeIdx: number | null;
  setChosenHome: (countryIdx: number | null) => void;
  /** The whole map: the scope of every insight when nothing is selected. */
  world: WorldSummary;
  /** How much of the map the column covers, measured, so the camera and overlays stand clear */
  columnInset: ColumnInset;
  setColumnInset: (inset: ColumnInset) => void;
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

/** View state preserved across save changes. */
type Eu5ViewState = Pick<Eu5State, "columnInset" | "timelineBarHeight">;

export type ColumnInset = { left: number; bottom: number };

/** The column's width at rest, until it is measured */
const RESTING_INSET: ColumnInset = { left: 340, bottom: 0 };

export const createEu5Store = ({
  opened,
  input,
  saveInput,
  view,
}: {
  opened: OpenedSave;
  input: Eu5SaveInput;
  saveInput: Eu5ParsedSave;

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
    viewpointCountryIdx: opened.viewpointCountryIdx,
    customTitle: readStored(`eu5-title-${opened.playthroughId}`),
    setCustomTitle: (title) => {
      const trimmed = title.trim();
      writeStored(`eu5-title-${opened.playthroughId}`, trimmed || null);
      set({ customTitle: trimmed || null });
    },
    chosenHomeIdx: readChosenHome(opened.playthroughId, opened.players),
    setChosenHome: (countryIdx) => {
      writeChosenHome(opened.playthroughId, countryIdx);
      set({ chosenHomeIdx: countryIdx });
    },
    world: opened.world,
    columnInset: view?.columnInset ?? RESTING_INSET,
    timelineBarHeight: view?.timelineBarHeight ?? 0,
    setColumnInset: (inset) =>
      set((state) =>
        state.columnInset.left === inset.left && state.columnInset.bottom === inset.bottom
          ? state
          : { columnInset: inset },
      ),
    setTimelineBarHeight: (height) => set({ timelineBarHeight: height }),
    uploadedSaveId: null,
    setUploadedSaveId: (id) => set({ uploadedSaveId: id }),
  }));

  engine.subscribe((appState) => {
    store.setState({ appState });
  });

  return store;
};

export function eu5ViewState(store: Eu5Store): Partial<Eu5ViewState> {
  const { columnInset, timelineBarHeight } = store.getState();
  return { columnInset, timelineBarHeight };
}

export function useEu5Context() {
  return check(useContext(Eu5Context), "Missing EU5 Context");
}

export function useInEu5Analysis() {
  return useContext(Eu5Context) != undefined;
}

/** A value that the reader chose for a campaign. Without storage, it lasts until the save closes. */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Only this session has the value.
  }
}

const chosenHomeKey = (playthroughId: PlaythroughId | null) => `eu5-my-country-${playthroughId}`;

/** A campaign remembers which player the reader is. Without storage, nothing is chosen. */
function readChosenHome(
  playthroughId: PlaythroughId | null,
  players: readonly { countryIdx: number }[],
): number | null {
  if (playthroughId === null || players.length < 2) return null;
  try {
    const stored = Number(localStorage.getItem(chosenHomeKey(playthroughId)) ?? Number.NaN);
    return players.some((player) => player.countryIdx === stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeChosenHome(playthroughId: PlaythroughId | null, countryIdx: number | null) {
  if (playthroughId === null) return;
  try {
    if (countryIdx === null) localStorage.removeItem(chosenHomeKey(playthroughId));
    else localStorage.setItem(chosenHomeKey(playthroughId), String(countryIdx));
  } catch {
    // The choice then lasts until the save closes.
  }
}

const useEu5Store = <T,>(selector: (state: Eu5State) => T): T =>
  useStore(useEu5Context(), selector);

export const useEu5Engine = () => useEu5Store((x) => x.engine);
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
/**
 * The one country that the save is about, if there is one: the player's in a
 * single player save, or the country that an observer save was written from.
 * The second is not a player, so a mark must not call it "You".
 */
export function useEu5HomeCountry(): { countryIdx: number; kind: "player" | "viewpoint" } | null {
  const players = useEu5Players();
  const viewpoint = useEu5Store((x) => x.viewpointCountryIdx);
  const chosen = useEu5Store((x) => x.chosenHomeIdx);
  if (players.length === 1) return { countryIdx: players[0].countryIdx, kind: "player" };
  if (players.length > 1 && chosen !== null) return { countryIdx: chosen, kind: "player" };
  if (players.length === 0 && viewpoint !== null) {
    return { countryIdx: viewpoint, kind: "viewpoint" };
  }
  return null;
}
export const useEu5CustomTitle = () => useEu5Store((x) => x.customTitle);
export const useSetEu5CustomTitle = () => useEu5Store((x) => x.setCustomTitle);
export const useEu5ChosenHome = () => useEu5Store((x) => x.chosenHomeIdx);
export const useSetEu5ChosenHome = () => useEu5Store((x) => x.setChosenHome);
export const useEu5Multiplayer = () => useEu5Store((x) => x.multiplayer);
export const useEu5SelectionState = () => useEu5Store((x) => x.appState.selectionState);
export const useEu5SelectionRevision = () => useEu5Store((x) => x.appState.selectionRevision);
export const useEu5UserSelectionRevision = () =>
  useEu5Store((x) => x.appState.userSelectionRevision);
export const useEu5ColumnInset = () => useEu5Store((x) => x.columnInset);
export const useSetEu5ColumnInset = () => useEu5Store((x) => x.setColumnInset);
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
