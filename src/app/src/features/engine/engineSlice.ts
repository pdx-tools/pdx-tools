import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "@/lib/store";

// - Initial page load:
// - File analysis (start transition, start analysis, progress 0)
//   - Transitioned (show progress screen)
// - Loaded (Show analysis screen)

type AnalysisState =
  | { kind: "initial"; error?: string }
  | {
      kind: "analyzing";
      percent: number;
      recur: boolean;
    }
  | {
      kind: "analyzed";
      recur: boolean;
      drawn: boolean;
    };

export type DetectedDataType = "eu4" | "ck3" | "hoi4" | "imperator" | "vic3";

interface EngineState {
  analyzeId: number;
  game: DetectedDataType | null;
  analysisState: AnalysisState;
  analyzeFileName: string;
  isImmersive: boolean;
  showOneTimeLineItems: boolean;
  prefereredValueFormat: "absolute" | "percent";
  canvasWidth: number;
  canvasHeight: number;
}

const initialState: EngineState = {
  analyzeId: 0,
  game: null,
  analyzeFileName: "savefile.eu4",
  analysisState: { kind: "initial" },
  isImmersive: false,
  showOneTimeLineItems: true,
  prefereredValueFormat: "absolute",
  canvasWidth: 0,
  canvasHeight: 0,
};

interface ModuleLoaded {
  filename: string;
  game: DetectedDataType;
  isImmersive: boolean;
}

const engineSlice = createSlice({
  name: "engine",
  initialState: initialState,
  reducers: {
    resetSaveAnalysis(state) {
      // This is for when the "load sample" triggers an unmount
      // at the same time as a parse
      if (state.analysisState.kind === "analyzing") {
        return;
      }

      state.analysisState = { kind: "initial" };
      state.game = null;
    },

    startSaveAnalyze(state) {
      if (
        state.analysisState.kind == "initial" ||
        state.analysisState.kind == "analyzed"
      ) {
        state.analysisState = {
          kind: "analyzing",
          recur: state.analysisState.kind == "analyzed",
          percent: 0,
        };
      }
    },

    moduleDrawn(state) {
      if (state.analysisState.kind == "analyzed") {
        state.analysisState.drawn = true;
      }
    },

    moduleLoaded(state, action: PayloadAction<ModuleLoaded>) {
      if (state.analysisState.kind != "analyzing") {
        throw new Error(
          `engine module loaded requires analyzing state, but was ${state.analysisState.kind}`
        );
      }

      state.analyzeId += 1;
      state.analyzeFileName = action.payload.filename;
      state.game = action.payload.game;
      state.analysisState = {
        kind: "analyzed",
        drawn: !action.payload.isImmersive,
        recur: state.analysisState.recur,
      };

      state.isImmersive = action.payload.isImmersive;
    },

    engineFailure(state, action: PayloadAction<string>) {
      state.analysisState = {
        kind: "initial",
        error: action.payload,
      };
    },

    setSaveAnalyzePercent(state, action: PayloadAction<number>) {
      if (state.analysisState.kind === "analyzing") {
        state.analysisState.percent = action.payload;
      }
    },
    incrementSaveAnalyzePercent(state, action: PayloadAction<number>) {
      if (state.analysisState.kind === "analyzing") {
        state.analysisState.percent += action.payload;
      }
    },
    canvasResize(state, action: PayloadAction<[number, number]>) {
      state.canvasWidth = action.payload[0];
      state.canvasHeight = action.payload[1];
    },
    setShowOneTimeLineItems(state, action: PayloadAction<boolean>) {
      state.showOneTimeLineItems = action.payload;
    },
    setPrefersPercents(state, action: PayloadAction<boolean>) {
      state.prefereredValueFormat = action.payload ? "percent" : "absolute";
    },
  },
});

export const {
  canvasResize,
  moduleLoaded,
  engineFailure,
  incrementSaveAnalyzePercent,
  resetSaveAnalysis,
  setSaveAnalyzePercent,
  startSaveAnalyze,
  setPrefersPercents,
  setShowOneTimeLineItems,
  moduleDrawn,
} = engineSlice.actions;

export const selectAnalyzeOriginalBackdropVisible = (state: RootState) => {
  switch (state.engine.analysisState.kind) {
    case "initial":
      return true;
    case "analyzing":
      return !state.engine.analysisState.recur;
    case "analyzed":
      return (
        !state.engine.analysisState.drawn && !state.engine.analysisState.recur
      );
  }
};

export const selectAppHeaderVisible = (state: RootState) => {
  switch (state.engine.analysisState.kind) {
    case "initial":
      return true;
    case "analyzing":
      return !state.engine.analysisState.recur;
    case "analyzed":
      return !(state.engine.isImmersive && state.engine.analysisState.drawn);
  }
};

export const selectAnalyzeProgressVisible = (state: RootState) => {
  switch (state.engine.analysisState.kind) {
    case "initial":
      return false;
    case "analyzing":
      return true;
    case "analyzed":
      return !state.engine.analysisState.drawn;
  }
};

export const selectAnalyzeRecurAnalysis = (state: RootState) => {
  switch (state.engine.analysisState.kind) {
    case "analyzing":
    case "analyzed":
      return state.engine.analysisState.recur;
    default:
      return false;
  }
};

export const selectSaveAnalayzePercent = (state: RootState): number => {
  switch (state.engine.analysisState.kind) {
    case "initial":
      return 0;
    case "analyzing":
      return state.engine.analysisState.percent;
    case "analyzed":
      return 100;
  }
};

export const selectShowCanvas = (state: RootState): boolean => {
  switch (state.engine.analysisState.kind) {
    case "initial":
      return false;
    case "analyzing":
      return state.engine.analysisState.recur;
    case "analyzed":
      return state.engine.isImmersive;
  }
};

// We want to maintain the game module between loads in case one
// is going from one eu4 save to the next. Otherwise we unmount
// the module.
export const selectAnalyzeGame = (state: RootState) => state.engine.game;

export const selectModuleDrawn = (state: RootState) =>
  !selectAnalyzeOriginalBackdropVisible(state);

export const selectEngineError = (state: RootState) => {
  switch (state.engine.analysisState.kind) {
    case "initial": {
      return state.engine.analysisState.error ?? null;
    }
    default:
      return null;
  }
};

export const selectAnalyzeId = (state: RootState) => state.engine.analyzeId;
export const selectAnalyzeFileName = (state: RootState) =>
  state.engine.analyzeFileName;
export const selectCanvasWidth = (state: RootState) => state.engine.canvasWidth;
export const selectCanvasHeight = (state: RootState) =>
  state.engine.canvasHeight;

export const selectPrefersPercents = (state: RootState): boolean =>
  state.engine.prefereredValueFormat == "percent";
export const selectOneTimeLineItems = (state: RootState): boolean =>
  state.engine.showOneTimeLineItems;

export const { reducer } = engineSlice;
