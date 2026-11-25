import { create } from "zustand";
import type { Eu4SaveInput } from "@/features/eu4/store";
import type { Eu5SaveInput } from "@/features/eu5/store/types";
import type { Vic3SaveInput } from "@/features/vic3/store";
import type { CampaignGame, LocalSaveRef } from "@/features/campaign/types";
import { terminateCurrentAnalysis } from "./analysisLifecycle";

export type SaveGameInput =
  | { kind: "eu4"; data: Eu4SaveInput }
  | { kind: "eu5"; data: Eu5SaveInput }
  | { kind: "ck3"; file: File }
  | { kind: "hoi4"; file: File }
  | { kind: "imperator"; file: File }
  | { kind: "vic3"; data: Vic3SaveInput };

export type DetectedDataType = SaveGameInput["kind"];

export function extensionType(filename: string): DetectedDataType {
  const splits = filename.split(".");
  const extension = splits[splits.length - 1].toLowerCase();
  switch (extension) {
    case "rome":
      return "imperator";
    case "eu4":
    case "eu5":
    case "ck3":
    case "hoi4":
      return extension;
    case "v3":
      return "vic3";
    default:
      return "eu4";
  }
}

type EngineState = {
  input: SaveGameInput | null;
  actions: {
    resetSaveAnalysis: () => void;
    fileInput: (input: SaveGameInput) => void;
  };
};

/** Two files or handles can have equal properties, such as their name, and not be the same. */
function sameInput(a: SaveGameInput, b: SaveGameInput | null): boolean {
  if (a.kind !== b?.kind) return false;
  const [x, y] = [a, b].map((input) => ("data" in input ? input.data : input));
  if ("saveId" in x || "saveId" in y) {
    return "saveId" in x && "saveId" in y && x.saveId === y.saveId;
  }
  return x.file === y.file;
}

const useEngineStore = create<EngineState>()((set, get) => ({
  input: null,
  actions: {
    resetSaveAnalysis: () => {
      terminateCurrentAnalysis({ from: get().input, to: null });
      set({ input: null });
    },
    fileInput: (input: SaveGameInput) => {
      if (!sameInput(input, get().input)) {
        terminateCurrentAnalysis({ from: get().input, to: input });
        set({ input });
      }
    },
  },
}));

/** Name the save that the view already shows, without a load. */
export const replaceInput = (input: SaveGameInput) => useEngineStore.setState({ input });

function localInput(input: SaveGameInput | null): [CampaignGame, LocalSaveRef] | null {
  if (input?.kind !== "eu4" && input?.kind !== "eu5") return null;
  return input.data.kind === "server" ? null : [input.kind, input.data];
}

/** The local file of a campaign game that the page shows. */
export function openLocalInput(game: CampaignGame): LocalSaveRef | null {
  const local = localInput(useEngineStore.getState().input);
  return local?.[0] === game ? local[1] : null;
}

/** Call `listener` in the same task as each change of the open save. */
export function subscribeSaveInput(
  listener: (game: CampaignGame | null, ref: LocalSaveRef | null) => void,
): () => void {
  return useEngineStore.subscribe(({ input }) => {
    const [game, ref] = localInput(input) ?? [null, null];
    listener(game, ref);
  });
}

export const useSaveFileInput = () => useEngineStore((x) => x.input);
export const useEngineActions = () => useEngineStore((x) => x.actions);
export const isSaveLoaded = () => useEngineStore.getState().input !== null;
