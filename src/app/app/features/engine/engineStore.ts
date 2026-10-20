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

const useEngineStore = create<EngineState>()((set, get) => ({
  input: null,
  actions: {
    resetSaveAnalysis: () => {
      terminateCurrentAnalysis({ from: get().input, to: null });
      set({ input: null });
    },
    fileInput: (input: SaveGameInput) => {
      if (!dequal(input, get().input)) {
        terminateCurrentAnalysis({ from: get().input, to: input });
        set({ input });
      }
    },
  },
}));

export const useSaveFileInput = () => useEngineStore((x) => x.input);
export const useEngineActions = () => useEngineStore((x) => x.actions);
const campaignViewers = new Set<symbol>();

/** Include uploaded-save viewers, whose input belongs to their route rather than this store. */
export function registerCampaignViewer() {
  const token = Symbol("campaign viewer");
  campaignViewers.add(token);
  return () => {
    campaignViewers.delete(token);
  };
}

export const isSaveLoaded = () =>
  useEngineStore.getState().input !== null || campaignViewers.size > 0;
