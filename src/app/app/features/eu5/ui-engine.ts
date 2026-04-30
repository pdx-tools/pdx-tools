import { Eu5GameAdapter } from "./game-adapter";
import type {
  BoxSelectOverlayRect,
  CursorHint,
  GameInstance,
  GradientConfig,
  HoverDisplayData,
  PaletteGradients,
  SelectionSummaryData,
} from "./game-adapter";
import type { Eu5SaveInput } from "./store/types";
import type {
  MapMode,
  StateEfficacyInsightData,
  CountryPopulationProfile,
  CountryProfile,
  MarketProfile,
  LocationProfile,
  DevelopmentInsightData,
  PossibleTaxInsightData,
  PossibleTaxScope,
  TaxGapInsightData,
  TaxGapScope,
  MarketInsightData,
  PopulationInsightData,
  BuildingLevelsInsightData,
  ReligionInsightData,
  RgoInsightData,
  ControlInsightData,
  Eu5DateComponents,
} from "@/wasm/wasm_eu5";
import type { CanvasSize, SharedCanvasInputConfig } from "@/lib/canvas_courier";

export interface AppState {
  currentMapMode: MapMode;
  hoverDisplayData: HoverDisplayData | null;
  isGeneratingScreenshot: boolean;
  ownerBordersEnabled: boolean;
  paletteGradients: PaletteGradients;
  mapModeGradient: GradientConfig | null;
  selectionState: SelectionSummaryData | null;
  selectionRevision: number;
  boxSelectRect: BoxSelectOverlayRect | null;
  cursorHint: CursorHint;
}

export type AppStateListener = (state: AppState) => void;
export type AppStateSelector<T> = (state: AppState) => T;

export type SearchResult =
  | {
      kind: "country";
      id: number;
      name: string;
      tag: string;
      locationIdx: number;
    }
  | {
      kind: "location";
      id: number;
      name: string;
      locationIdx: number;
    };

export interface AppTriggers {
  selectMapMode(mode: MapMode): Promise<void>;
  generateScreenshot(fullResolution: boolean): Promise<Blob>;
  toggleOwnerBorders(): Promise<void>;
  getLocationArrays(): Promise<Blob>;
  melt(): Promise<Uint8Array<ArrayBuffer>>;
  getStateEfficacy(): Promise<StateEfficacyInsightData>;
  getCountryProfile(anchorLocationIdx: number): Promise<CountryProfile | null>;
  getCountryPopulationProfile(anchorLocationIdx: number): Promise<CountryPopulationProfile | null>;
  getMarketProfile(anchorLocationIdx: number): Promise<MarketProfile | null>;
  getLocationProfile(locationIdx: number): Promise<LocationProfile | null>;
  getDevelopmentInsight(): Promise<DevelopmentInsightData>;
  getPossibleTaxInsight(): Promise<PossibleTaxInsightData>;
  getPossibleTaxScope(): Promise<PossibleTaxScope>;
  getTaxGapInsight(): Promise<TaxGapInsightData>;
  getTaxGapScope(): Promise<TaxGapScope>;
  getMarketInsight(): Promise<MarketInsightData>;
  getPopulationInsight(): Promise<PopulationInsightData>;
  getBuildingLevelsInsight(): Promise<BuildingLevelsInsightData>;
  getReligionInsight(): Promise<ReligionInsightData>;
  getRgoInsight(): Promise<RgoInsightData>;
  getControlInsight(): Promise<ControlInsightData>;
  getPoliticalDefaultCountryAnchor(): Promise<number | null>;
  selectEntity(locationIdx: number): Promise<void>;
  selectCountry(anchorLocationIdx: number): Promise<void>;
  addCountry(anchorLocationIdx: number): Promise<void>;
  removeCountry(anchorLocationIdx: number): Promise<void>;
  selectMarket(anchorLocationIdx: number): Promise<void>;
  addMarket(anchorLocationIdx: number): Promise<void>;
  removeMarket(anchorLocationIdx: number): Promise<void>;
  setFocusedLocation(locationIdx: number): Promise<void>;
  clearFocus(): Promise<void>;
  clearFocusOrSelection(): Promise<void>;
  selectPlayers(): Promise<void>;
  clearSelection(): Promise<void>;
  searchEntities(query: string): Promise<SearchResult[]>;
  panToLocation(
    locationIdx: number,
    insets: { left: number; right: number; top: number; bottom: number },
  ): Promise<void>;
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
    paletteGradients: PaletteGradients,
    initialState?: Partial<AppState>,
  ) {
    this._state = {
      currentMapMode: "political",
      hoverDisplayData: null,
      isGeneratingScreenshot: false,
      ownerBordersEnabled: true,
      paletteGradients,
      mapModeGradient: null,
      selectionState: null,
      selectionRevision: 0,
      boxSelectRect: null,
      cursorHint: "default",
      ...initialState,
    };

    // Set up hover display data callback
    this.gameInstance.onHoverDisplayUpdate((data) => {
      this.updateState(() => ({
        hoverDisplayData: data,
      }));
    });

    this.gameInstance.onSelectionUpdate((data, gradient) => {
      this.updateState((state) => ({
        selectionState: data,
        selectionRevision: state.selectionRevision + 1,
        mapModeGradient: gradient ?? null,
      }));
    });

    this.gameInstance.onBoxSelectRectUpdate((rect) => {
      this.updateState(() => ({
        boxSelectRect: rect,
      }));
    });

    this.gameInstance.onCursorHintUpdate((hint) => {
      this.updateState(() => ({ cursorHint: hint }));
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
    getCountryProfile: (anchorLocationIdx) =>
      this.gameInstance.getCountryProfile(anchorLocationIdx),
    getCountryPopulationProfile: (anchorLocationIdx) =>
      this.gameInstance.getCountryPopulationProfile(anchorLocationIdx),
    getMarketProfile: (anchorLocationIdx) => this.gameInstance.getMarketProfile(anchorLocationIdx),
    getLocationProfile: (locationIdx) => this.gameInstance.getLocationProfile(locationIdx),
    getDevelopmentInsight: () => this.gameInstance.getDevelopmentInsight(),
    getPossibleTaxInsight: () => this.gameInstance.getPossibleTaxInsight(),
    getPossibleTaxScope: () => this.gameInstance.getPossibleTaxScope(),
    getTaxGapInsight: () => this.gameInstance.getTaxGapInsight(),
    getTaxGapScope: () => this.gameInstance.getTaxGapScope(),
    getMarketInsight: () => this.gameInstance.getMarketInsight(),
    getPopulationInsight: () => this.gameInstance.getPopulationInsight(),
    getBuildingLevelsInsight: () => this.gameInstance.getBuildingLevelsInsight(),
    getReligionInsight: () => this.gameInstance.getReligionInsight(),
    getRgoInsight: () => this.gameInstance.getRgoInsight(),
    getControlInsight: () => this.gameInstance.getControlInsight(),
    getPoliticalDefaultCountryAnchor: () => this.gameInstance.getPoliticalDefaultCountryAnchor(),
    selectEntity: (locationIdx) => this.handleSelectEntity(locationIdx),
    selectCountry: (locationIdx) => this.gameInstance.selectCountry(locationIdx),
    addCountry: (locationIdx) => this.gameInstance.addCountry(locationIdx),
    removeCountry: (locationIdx) => this.gameInstance.removeCountry(locationIdx),
    selectMarket: (locationIdx) => this.gameInstance.selectMarket(locationIdx),
    addMarket: (locationIdx) => this.gameInstance.addMarket(locationIdx),
    removeMarket: (locationIdx) => this.gameInstance.removeMarket(locationIdx),
    setFocusedLocation: (locationIdx) => this.handleSetFocusedLocation(locationIdx),
    clearFocus: () => this.handleClearFocus(),
    clearFocusOrSelection: () => this.handleClearFocusOrSelection(),
    selectPlayers: () => this.handleSelectPlayers(),
    clearSelection: () => this.handleClearSelection(),
    searchEntities: (query) => this.handleSearchEntities(query),
    panToLocation: (locationIdx, insets) => this.gameInstance.panToLocation(locationIdx, insets),
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
    try {
      await this.gameInstance.setMapMode(mode);
    } catch (error) {
      console.error("Failed to set map mode:", error);
    }
    this.updateState(() => ({ currentMapMode: mode }));
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

  private async handleGetStateEfficacy(): Promise<StateEfficacyInsightData> {
    return await this.gameInstance.getStateEfficacy();
  }

  private async handleSelectEntity(locationIdx: number): Promise<void> {
    await this.gameInstance.selectEntity(locationIdx);
  }

  private async handleSetFocusedLocation(locationIdx: number): Promise<void> {
    await this.gameInstance.setFocusedLocation(locationIdx);
  }

  private async handleClearFocus(): Promise<void> {
    await this.gameInstance.clearFocus();
  }

  private async handleClearFocusOrSelection(): Promise<void> {
    await this.gameInstance.clearFocusOrSelection();
  }

  private async handleSelectPlayers(): Promise<void> {
    await this.gameInstance.selectPlayers();
  }

  private async handleClearSelection(): Promise<void> {
    await this.gameInstance.clearSelection();
  }

  private async handleSearchEntities(query: string): Promise<SearchResult[]> {
    return await this.gameInstance.searchEntities(query);
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
): Promise<{
  engine: Eu5UIEngine;
  saveDate: Eu5DateComponents;
  playthroughName: string;
}> {
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

  const [metadata, paletteGradients] = await Promise.all([
    gameInstance.getSaveMetadata(),
    gameInstance.getPaletteGradients(),
  ]);

  const engine = new Eu5UIEngine(gameInstance, workers, paletteGradients);
  return {
    engine,
    saveDate: metadata.date,
    playthroughName: metadata.playthroughName,
  };
}
