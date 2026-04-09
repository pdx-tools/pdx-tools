import { Eu5GameAdapter } from "./game-adapter";
import type { GameInstance, HoverDisplayData, MapModeRange } from "./game-adapter";
import type { Eu5SaveInput } from "./store/types";
import type { MapMode, StateEfficacyData } from "@/wasm/wasm_eu5";
import type { CanvasSize, SharedCanvasInputConfig } from "@/lib/canvas_courier";

export interface AppState {
  currentMapMode: MapMode;
  hoverDisplayData: HoverDisplayData | null;
  isGeneratingScreenshot: boolean;
  ownerBordersEnabled: boolean;
  mapModeRange: MapModeRange | null;
}

export type AppStateListener = (state: AppState) => void;
export type AppStateSelector<T> = (state: AppState) => T;

export interface AppTriggers {
  selectMapMode(mode: MapMode): Promise<void>;
  generateScreenshot(fullResolution: boolean): Promise<Blob>;
  toggleOwnerBorders(): Promise<void>;
  getLocationArrays(): Promise<Blob>;
  melt(): Promise<Uint8Array<ArrayBuffer>>;
  getStateEfficacy(): Promise<StateEfficacyData>;
}

export interface AppEngine {
  trigger: AppTriggers;
  state: AppState;
  subscribe(listener: AppStateListener): () => void;
  getState(): AppState;
  destroy(): void;
}

export class Eu5UIEngine implements AppEngine {
  private _state: AppState;
  private listeners: Set<AppStateListener> = new Set();

  constructor(
    private gameInstance: GameInstance,
    private workers: Eu5GameAdapter,
    initialState?: Partial<AppState>,
  ) {
    this._state = {
      currentMapMode: "political",
      hoverDisplayData: null,
      isGeneratingScreenshot: false,
      ownerBordersEnabled: true,
      mapModeRange: null,
      ...initialState,
    };

    // Set up hover display data callback
    this.gameInstance.onHoverDisplayUpdate((data) => {
      this.updateState(() => ({
        hoverDisplayData: data,
      }));
    });

    // Start hover tracking
    this.gameInstance.startHoverTracking();
  }

  public readonly trigger: AppTriggers = {
    selectMapMode: (mode) => this.handleSelectMapMode(mode),
    generateScreenshot: (fullResolution) => this.handleGenerateScreenshot(fullResolution),
    toggleOwnerBorders: () => this.handleToggleOwnerBorders(),
    getLocationArrays: () => this.handleGetLocationArrays(),
    melt: () => this.handleMelt(),
    getStateEfficacy: () => this.handleGetStateEfficacy(),
  };

  get state(): AppState {
    return { ...this._state };
  }

  subscribe(listener: AppStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): AppState {
    return this.state;
  }

  destroy(): void {
    this.gameInstance.stopHoverTracking();
    this.workers.terminate();
    this.listeners.clear();
  }

  private updateState(updater: (state: AppState) => Partial<AppState>): void {
    const updates = updater(this._state);
    this._state = { ...this._state, ...updates };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  private async handleSelectMapMode(mode: MapMode): Promise<void> {
    await this.gameInstance.setMapMode(mode);

    // Fetch map mode range for legend
    try {
      const mapModeRange = await this.gameInstance.getMapModeRange(mode);
      this.updateState(() => ({ currentMapMode: mode, mapModeRange }));
    } catch (error) {
      // If getting the range fails, still update the map mode
      console.error("Failed to fetch map mode range:", error);
      this.updateState(() => ({ currentMapMode: mode, mapModeRange: null }));
    }
  }

  private async handleToggleOwnerBorders(): Promise<void> {
    const newEnabled = !this._state.ownerBordersEnabled;
    this.gameInstance.setOwnerBorders(newEnabled);
    this.updateState(() => ({ ownerBordersEnabled: newEnabled }));
  }

  private async handleGetLocationArrays(): Promise<Blob> {
    return await this.gameInstance.getLocationArrays();
  }

  private async handleGenerateScreenshot(fullResolution: boolean): Promise<Blob> {
    if (this._state.isGeneratingScreenshot) {
      throw new Error("Screenshot generation already in progress");
    }

    this.updateState(() => ({ isGeneratingScreenshot: true }));

    try {
      const blob = await this.gameInstance.generateWorldScreenshot(fullResolution);
      return blob;
    } finally {
      this.updateState(() => ({ isGeneratingScreenshot: false }));
    }
  }

  private async handleMelt(): Promise<Uint8Array<ArrayBuffer>> {
    return await this.gameInstance.melt();
  }

  private async handleGetStateEfficacy(): Promise<StateEfficacyData> {
    return await this.gameInstance.getStateEfficacy();
  }
}

// Factory function for creating a loaded engine after save loading
export async function createLoadedEngine(
  saveInput: Eu5SaveInput,
  canvas: {
    offscreen: OffscreenCanvas;
    display: CanvasSize;
    inputConfig: SharedCanvasInputConfig;
  },
  onProgress?: (increment: number) => void,
): Promise<{ engine: Eu5UIEngine; saveDate: string; playthroughName: string }> {
  const { offscreen, display, inputConfig } = canvas;

  const workers = Eu5GameAdapter.create();
  const gameInstance = await workers.newSave(
    {
      canvas: offscreen,
      display,
      inputConfig,
      save: saveInput,
    },
    onProgress,
  );

  const metadata = await gameInstance.getSaveMetadata();

  const engine = new Eu5UIEngine(gameInstance, workers);
  return {
    engine,
    saveDate: metadata.date,
    playthroughName: metadata.playthroughName,
  };
}
