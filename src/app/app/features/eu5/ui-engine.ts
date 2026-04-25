import { Eu5GameAdapter } from "./game-adapter";
import type {
  BoxSelectOverlayRect,
  CursorHint,
  GameInstance,
  HoverDisplayData,
  MapModeRange,
  SelectionSummaryData,
} from "./game-adapter";
import type { Eu5SaveInput } from "./store/types";
import type {
  MapMode,
  StateEfficacyData,
  EntityHeader,
  OverviewSection,
  EconomySection,
  LocationsSection,
  DiplomacySection,
  LocationProfile,
  EntityBreakdownData,
  LocationDistribution,
  DevelopmentInsightData,
  PossibleTaxInsightData,
  PossibleTaxScope,
  TaxGapInsightData,
  TaxGapScope,
  MarketInsightData,
  PopulationInsightData,
  BuildingLevelsInsightData,
  ScopeSummary,
  Eu5DateComponents,
} from "@/wasm/wasm_eu5";
import type { CanvasSize, SharedCanvasInputConfig } from "@/lib/canvas_courier";

export interface AppState {
  currentMapMode: MapMode;
  hoverDisplayData: HoverDisplayData | null;
  isGeneratingScreenshot: boolean;
  ownerBordersEnabled: boolean;
  mapModeRange: MapModeRange | null;
  selectionState: SelectionSummaryData | null;
  selectionRevision: number;
  boxSelectRect: BoxSelectOverlayRect | null;
  cursorHint: CursorHint;
}

export type AppStateListener = (state: AppState) => void;
export type AppStateSelector<T> = (state: AppState) => T;

export interface SearchResult {
  kind: "country";
  id: number;
  name: string;
  tag: string;
  locationIdx: number;
}

export interface AppTriggers {
  selectMapMode(mode: MapMode): Promise<void>;
  generateScreenshot(fullResolution: boolean): Promise<Blob>;
  toggleOwnerBorders(): Promise<void>;
  getLocationArrays(): Promise<Blob>;
  melt(): Promise<Uint8Array<ArrayBuffer>>;
  getStateEfficacy(): Promise<StateEfficacyData>;
  getEntityHeader(): Promise<EntityHeader | null>;
  getOverviewSection(): Promise<OverviewSection | null>;
  getEconomySection(): Promise<EconomySection | null>;
  getLocationsSection(): Promise<LocationsSection | null>;
  getDiplomacySection(): Promise<DiplomacySection | null>;
  getLocationProfile(locationIdx: number): Promise<LocationProfile | null>;
  getEntityBreakdown(): Promise<EntityBreakdownData>;
  getLocationDistribution(): Promise<LocationDistribution>;
  getDevelopmentInsight(): Promise<DevelopmentInsightData>;
  getPossibleTaxInsight(): Promise<PossibleTaxInsightData>;
  getPossibleTaxScope(): Promise<PossibleTaxScope>;
  getTaxGapInsight(): Promise<TaxGapInsightData>;
  getTaxGapScope(): Promise<TaxGapScope>;
  getMarketInsight(): Promise<MarketInsightData>;
  getPopulationInsight(): Promise<PopulationInsightData>;
  getBuildingLevelsInsight(): Promise<BuildingLevelsInsightData>;
  getScopeSummary(): Promise<ScopeSummary>;
  getEntityHeaderFor(anchorLocationIdx: number): Promise<EntityHeader | null>;
  getOverviewSectionFor(anchorLocationIdx: number): Promise<OverviewSection | null>;
  getEconomySectionFor(anchorLocationIdx: number): Promise<EconomySection | null>;
  getLocationsSectionFor(anchorLocationIdx: number): Promise<LocationsSection | null>;
  getDiplomacySectionFor(anchorLocationIdx: number): Promise<DiplomacySection | null>;
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
    initialState?: Partial<AppState>,
  ) {
    this._state = {
      currentMapMode: "political",
      hoverDisplayData: null,
      isGeneratingScreenshot: false,
      ownerBordersEnabled: true,
      mapModeRange: null,
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

    // Set up selection state callback
    this.gameInstance.onSelectionUpdate((data) => {
      this.updateState((state) => ({
        selectionState: data,
        selectionRevision: state.selectionRevision + 1,
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
    getEntityHeader: () => this.gameInstance.getEntityHeader(),
    getOverviewSection: () => this.gameInstance.getOverviewSection(),
    getEconomySection: () => this.gameInstance.getEconomySection(),
    getLocationsSection: () => this.gameInstance.getLocationsSection(),
    getDiplomacySection: () => this.gameInstance.getDiplomacySection(),
    getLocationProfile: (locationIdx) => this.gameInstance.getLocationProfile(locationIdx),
    getEntityBreakdown: () => this.gameInstance.getEntityBreakdown(),
    getLocationDistribution: () => this.gameInstance.getLocationDistribution(),
    getDevelopmentInsight: () => this.gameInstance.getDevelopmentInsight(),
    getPossibleTaxInsight: () => this.gameInstance.getPossibleTaxInsight(),
    getPossibleTaxScope: () => this.gameInstance.getPossibleTaxScope(),
    getTaxGapInsight: () => this.gameInstance.getTaxGapInsight(),
    getTaxGapScope: () => this.gameInstance.getTaxGapScope(),
    getMarketInsight: () => this.gameInstance.getMarketInsight(),
    getPopulationInsight: () => this.gameInstance.getPopulationInsight(),
    getBuildingLevelsInsight: () => this.gameInstance.getBuildingLevelsInsight(),
    getScopeSummary: () => this.gameInstance.getScopeSummary(),
    getEntityHeaderFor: (anchorLocationIdx) =>
      this.gameInstance.getEntityHeaderFor(anchorLocationIdx),
    getOverviewSectionFor: (anchorLocationIdx) =>
      this.gameInstance.getOverviewSectionFor(anchorLocationIdx),
    getEconomySectionFor: (anchorLocationIdx) =>
      this.gameInstance.getEconomySectionFor(anchorLocationIdx),
    getLocationsSectionFor: (anchorLocationIdx) =>
      this.gameInstance.getLocationsSectionFor(anchorLocationIdx),
    getDiplomacySectionFor: (anchorLocationIdx) =>
      this.gameInstance.getDiplomacySectionFor(anchorLocationIdx),
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
    const results = await this.gameInstance.searchCountries(query);
    return results.map((r) => ({
      kind: "country" as const,
      id: r.id,
      name: r.name,
      tag: r.tag,
      locationIdx: r.capitalLocationIdx ?? 0,
    }));
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

  const metadata = await gameInstance.getSaveMetadata();

  const engine = new Eu5UIEngine(gameInstance, workers);
  return {
    engine,
    saveDate: metadata.date,
    playthroughName: metadata.playthroughName,
  };
}
