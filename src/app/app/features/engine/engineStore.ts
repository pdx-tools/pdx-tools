import { dequal } from "@/lib/dequal";
import { create } from "zustand";
import type { Eu4SaveInput } from "@/features/eu4/store";
import type { Eu5SaveInput } from "@/features/eu5/store/types";
import type { Vic3SaveInput } from "@/features/vic3/store";
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
  const extension = splits[splits.length - 1];
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
  /**
   * The input continues the analysis that was on screen, such as the next
   * save of a campaign, so the page does not enter as a new analysis.
   */
  continuesAnalysis: boolean;
  actions: {
    resetSaveAnalysis: () => void;
    fileInput: (input: SaveGameInput) => void;
  };
};

const useEngineStore = create<EngineState>()((set, get) => ({
  input: null,
  continuesAnalysis: false,
  actions: {
    resetSaveAnalysis: () => {
      terminateCurrentAnalysis();
      set({ input: null, continuesAnalysis: false });
    },
    fileInput: (input: SaveGameInput) => {
      if (!dequal(input, get().input)) {
        const continuesAnalysis = terminateCurrentAnalysis(input);
        set({ input, continuesAnalysis });
      }
    },
  },
}));

export const useSaveFileInput = () => useEngineStore((x) => x.input);
export const useContinuesAnalysis = () => useEngineStore((x) => x.continuesAnalysis);
export const useEngineActions = () => useEngineStore((x) => x.actions);
export const isSaveLoaded = () => useEngineStore.getState().input !== null;
