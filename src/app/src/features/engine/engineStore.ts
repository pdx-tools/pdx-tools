import { dequal } from "@/lib/dequal";
import { create } from "zustand";
import { type Eu4SaveInput } from "@/features/eu4/store";
import { type Vic3SaveInput } from "@/features/vic3/store";

export type SaveGameInput =
  | { kind: "eu4"; data: Eu4SaveInput }
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
    resetSaveAnalysis: () => set({ input: null }),
    fileInput: (input: SaveGameInput) => {
      if (!dequal(input, get().input)) {
        set({ input });
      }
    },
  },
}));

export const useSaveFileInput = () => useEngineStore((x) => x.input);
export const useEngineActions = () => useEngineStore((x) => x.actions);
