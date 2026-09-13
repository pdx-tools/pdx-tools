import { Eu5GameAdapter } from "./game-adapter";
import type {
  BoxSelectOverlayRect,
  CursorHint,
  GameInstance,
  GradientConfig,
  DisplayData,
  PaletteGradients,
  SelectionSummaryData,
  TimelineChange,
  TimelineData,
} from "./game-adapter";
import { addDays, addMonths, addYears, clampDate, sameDate } from "./lib/eu5Date";
import type { Eu5SaveInput } from "./store/types";
import type { Eu5MapHoverTarget } from "./useEu5MapHoverTarget";
import type {
  MapMode,
  StateEfficacyInsightData,
  CountryPopulationProfile,
  CountryProfile,
  MarketProfile,
  LocationProfile,
  MarketProductionLocationSummary,
  DevelopmentInsightData,
  WealthInsightData,
  WealthScope,
  UnrealizedTaxBaseInsightData,
  UnrealizedTaxBaseScope,
  MarketInsightData,
  ScopedGoodSummary,
  PopulationInsightData,
  BuildingLevelsInsightData,
  ReligionInsightData,
  RgoInsightData,
  ControlInsightData,
  PoliticalWorldScoreboard,
  Eu5DateComponents,
} from "@/wasm/wasm_eu5";
import type { CanvasSize, SharedCanvasInputConfig } from "@/lib/canvas_courier";

/** Playback rate of the campaign timeline: one campaign year per real second. */
export const TIMELINE_DAYS_PER_SECOND = 365;

export type TimelineStepUnit = "day" | "month" | "year";

/**
 * What playback is doing. `rewinding` is the glide back to the campaign
 * start before a play from the save date; `ended` is the rest after playback
 * reaches the save date on its own, until the next date change.
 */
export type TimelinePlayback = "paused" | "rewinding" | "playing" | "ended";

/** How long the playhead takes to glide back to the campaign start, in ms. */
export const TIMELINE_REWIND_MS = 420;

export interface AppState {
  currentMapMode: MapMode;
  hoverDisplayData: DisplayData | null;
  isGeneratingScreenshot: boolean;
  ownerBordersEnabled: boolean;
  paletteGradients: PaletteGradients;
  mapModeGradient: GradientConfig | null;
  selectionState: SelectionSummaryData | null;
  selectionRevision: number;
  boxSelectRect: BoxSelectOverlayRect | null;
  cursorHint: CursorHint;
  timeline: TimelineData;
  /**
   * The date the user asked for. Updates on every drag frame, ahead of the
   * map, which follows at the pace the worker can render.
   */
  timelineDate: Eu5DateComponents;
  /**
   * The date the map shows. Lags `timelineDate` during a drag. The map is
   * live, and every map mode valid, when this is the timeline end.
   */
  timelineMapDate: Eu5DateComponents;
  timelinePlayback: TimelinePlayback;
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
  /**
   * Show the map on a date. Calls coalesce: only the latest date renders.
   * The save date returns the map to the live state and keeps the map mode.
   */
  setTimelineDate(date: Eu5DateComponents): void;
  stepTimeline(unit: TimelineStepUnit, direction: 1 | -1): void;
  pauseTimeline(): void;
  toggleTimelinePlayback(): void;
  generateScreenshot(fullResolution: boolean): Promise<Blob>;
  toggleOwnerBorders(): Promise<void>;
  getLocationArrays(): Promise<Blob>;
  melt(): Promise<Uint8Array<ArrayBuffer>>;
  getStateEfficacy(): Promise<StateEfficacyInsightData>;
  getCountryProfile(countryIdx: number): Promise<CountryProfile | null>;
  getCountryPopulationProfile(countryIdx: number): Promise<CountryPopulationProfile | null>;
  getMarketProfile(marketId: number): Promise<MarketProfile | null>;
  getMarketGoodsProfile(marketId: number): Promise<ScopedGoodSummary[]>;
  getMarketLocationsProfile(marketId: number): Promise<MarketProductionLocationSummary[]>;
  getLocationProfile(locationIdx: number): Promise<LocationProfile | null>;
  getDevelopmentInsight(): Promise<DevelopmentInsightData>;
  getWealthInsight(): Promise<WealthInsightData>;
  getWealthScope(): Promise<WealthScope>;
  getUnrealizedTaxBaseInsight(): Promise<UnrealizedTaxBaseInsightData>;
  getUnrealizedTaxBaseScope(): Promise<UnrealizedTaxBaseScope>;
  getMarketInsight(): Promise<MarketInsightData>;
  getPopulationInsight(): Promise<PopulationInsightData>;
  getBuildingLevelsInsight(): Promise<BuildingLevelsInsightData>;
  getReligionInsight(): Promise<ReligionInsightData>;
  getRgoInsight(): Promise<RgoInsightData>;
  getControlInsight(): Promise<ControlInsightData>;
  getPoliticalWorldScoreboard(): Promise<PoliticalWorldScoreboard>;
  getPoliticalDefaultCountryAnchor(): Promise<number | null>;
  selectCountry(countryIdx: number): Promise<void>;
  addCountry(countryIdx: number): Promise<void>;
  removeCountry(countryIdx: number): Promise<void>;
  selectMarket(marketId: number): Promise<void>;
  addMarket(marketId: number): Promise<void>;
  removeMarket(marketId: number): Promise<void>;
  setFocusedLocation(locationIdx: number): Promise<void>;
  clearFocus(): Promise<void>;
  clearFocusOrSelection(): Promise<void>;
  selectPlayers(): Promise<void>;
  clearSelection(): Promise<void>;
  highlightMapHoverTarget(target: Eu5MapHoverTarget): Promise<void>;
  clearMapHoverHighlight(): Promise<void>;
  searchEntities(query: string): Promise<SearchResult[]>;
  panToLocation(
    locationIdx: number,
    insets: { left: number; right: number; top: number; bottom: number },
  ): Promise<void>;
}

/** Only ownership has a history in the save, so only the political map can show a past date. */
export function isHistoricalMapMode(mode: MapMode): boolean {
  return mode === "political";
}

/** True when the map shows the save date, so every map mode is valid. */
export function isTimelineLive(state: Pick<AppState, "timeline" | "timelineMapDate">): boolean {
  return sameDate(state.timelineMapDate, state.timeline.end);
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

  /** The date to send once the in-flight timeline request returns. */
  private timelineQueued: Eu5DateComponents | null = null;
  private timelineInFlight = false;
  private playbackFrame: number | null = null;
  private rewindTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private gameInstance: GameInstance,
    private workers: Eu5GameAdapter,
    paletteGradients: PaletteGradients,
    timeline: TimelineData,
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
      timeline,
      timelineDate: timeline.end,
      timelineMapDate: timeline.end,
      timelinePlayback: "paused",
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
    setTimelineDate: (date) => this.handleSetTimelineDate(date),
    stepTimeline: (unit, direction) => this.handleStepTimeline(unit, direction),
    pauseTimeline: () => this.handlePauseTimeline(),
    toggleTimelinePlayback: () =>
      this.isTimelineRunning() ? this.handlePauseTimeline() : this.handlePlayTimeline(),
    generateScreenshot: (fullResolution) => this.handleGenerateScreenshot(fullResolution),
    toggleOwnerBorders: () => this.handleToggleOwnerBorders(),
    getLocationArrays: () => this.handleGetLocationArrays(),
    melt: () => this.handleMelt(),
    getStateEfficacy: () => this.handleGetStateEfficacy(),
    getCountryProfile: (countryIdx) => this.gameInstance.getCountryProfile(countryIdx),
    getCountryPopulationProfile: (countryIdx) =>
      this.gameInstance.getCountryPopulationProfile(countryIdx),
    getMarketProfile: (marketId) => this.gameInstance.getMarketProfile(marketId),
    getMarketGoodsProfile: (marketId) => this.gameInstance.getMarketGoodsProfile(marketId),
    getMarketLocationsProfile: (marketId) => this.gameInstance.getMarketLocationsProfile(marketId),
    getLocationProfile: (locationIdx) => this.gameInstance.getLocationProfile(locationIdx),
    getDevelopmentInsight: () => this.gameInstance.getDevelopmentInsight(),
    getWealthInsight: () => this.gameInstance.getWealthInsight(),
    getWealthScope: () => this.gameInstance.getWealthScope(),
    getUnrealizedTaxBaseInsight: () => this.gameInstance.getUnrealizedTaxBaseInsight(),
    getUnrealizedTaxBaseScope: () => this.gameInstance.getUnrealizedTaxBaseScope(),
    getMarketInsight: () => this.gameInstance.getMarketInsight(),
    getPopulationInsight: () => this.gameInstance.getPopulationInsight(),
    getBuildingLevelsInsight: () => this.gameInstance.getBuildingLevelsInsight(),
    getReligionInsight: () => this.gameInstance.getReligionInsight(),
    getRgoInsight: () => this.gameInstance.getRgoInsight(),
    getControlInsight: () => this.gameInstance.getControlInsight(),
    getPoliticalWorldScoreboard: () => this.gameInstance.getPoliticalWorldScoreboard(),
    getPoliticalDefaultCountryAnchor: () => this.gameInstance.getPoliticalDefaultCountryAnchor(),
    selectCountry: (countryIdx) => this.gameInstance.selectCountry(countryIdx),
    addCountry: (countryIdx) => this.gameInstance.addCountry(countryIdx),
    removeCountry: (countryIdx) => this.gameInstance.removeCountry(countryIdx),
    selectMarket: (marketId) => this.gameInstance.selectMarket(marketId),
    addMarket: (marketId) => this.gameInstance.addMarket(marketId),
    removeMarket: (marketId) => this.gameInstance.removeMarket(marketId),
    setFocusedLocation: (locationIdx) => this.handleSetFocusedLocation(locationIdx),
    clearFocus: () => this.handleClearFocus(),
    clearFocusOrSelection: () => this.handleClearFocusOrSelection(),
    selectPlayers: () => this.handleSelectPlayers(),
    clearSelection: () => this.handleClearSelection(),
    highlightMapHoverTarget: (target) => this.gameInstance.highlightMapHoverTarget(target),
    clearMapHoverHighlight: () => this.gameInstance.clearMapHoverHighlight(),
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
    this.handlePauseTimeline();
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
    // A mode without a history pulls the map back to the save date.
    if (!isTimelineLive(this._state) && !isHistoricalMapMode(mode)) {
      this.handlePauseTimeline();
    }
    try {
      const change = await this.gameInstance.setMapMode(mode);
      this.applyTimelineChange(change);
    } catch (error) {
      console.error("Failed to set map mode:", error);
      this.updateState(() => ({ currentMapMode: mode }));
    }
  }

  /** Adopt the worker's view of the timeline after any call that can move it. */
  private applyTimelineChange(change: TimelineChange): void {
    this.updateState(() => ({
      currentMapMode: change.mapMode,
      timelineMapDate: change.date,
      // The requested date stays ahead of the map only while a request is
      // queued behind this one.
      timelineDate: this.timelineQueued ?? change.date,
      mapModeGradient: change.gradient ?? null,
    }));
  }

  private handleSetTimelineDate(date: Eu5DateComponents): void {
    const timeline = this._state.timeline;
    if (!timeline.available) return;
    const clamped = clampDate(date, timeline.start, timeline.end);
    if (sameDate(clamped, this._state.timelineDate) && !this.timelineInFlight) return;
    this.updateState((state) => ({
      timelineDate: clamped,
      // Any move off the save date ends the rest that follows playback.
      timelinePlayback: state.timelinePlayback === "ended" ? "paused" : state.timelinePlayback,
    }));

    // Coalesce: while the worker renders one date, remember only the newest
    // request, so a drag never queues a frame per pointer event.
    if (this.timelineInFlight) {
      this.timelineQueued = clamped;
      return;
    }
    void this.sendTimelineDate(clamped);
  }

  private async sendTimelineDate(date: Eu5DateComponents): Promise<void> {
    this.timelineInFlight = true;
    try {
      const change = await this.gameInstance.setTimelineDate(date);
      this.applyTimelineChange(change);
    } catch (error) {
      console.error("Failed to set timeline date:", error);
    } finally {
      this.timelineInFlight = false;
    }

    const queued = this.timelineQueued;
    this.timelineQueued = null;
    if (queued !== null && !sameDate(queued, this._state.timelineMapDate)) {
      await this.sendTimelineDate(queued);
    }
  }

  private handleStepTimeline(unit: TimelineStepUnit, direction: 1 | -1): void {
    this.handlePauseTimeline();
    const from = this._state.timelineDate;
    const to =
      unit === "day"
        ? addDays(from, direction)
        : unit === "month"
          ? addMonths(from, direction)
          : addYears(from, direction);
    this.handleSetTimelineDate(to);
  }

  private isTimelineRunning(): boolean {
    const playback = this._state.timelinePlayback;
    return playback === "playing" || playback === "rewinding";
  }

  private handlePlayTimeline(): void {
    const timeline = this._state.timeline;
    if (!timeline.available || this.isTimelineRunning()) return;

    // A play from the save date first glides the playhead back to the
    // campaign start, so the eye can follow the rewind before borders move.
    if (sameDate(this._state.timelineDate, timeline.end)) {
      this.updateState(() => ({ timelinePlayback: "rewinding" }));
      this.handleSetTimelineDate(timeline.start);
      this.rewindTimer = setTimeout(() => {
        this.rewindTimer = null;
        this.startPlaybackLoop(timeline.end);
      }, TIMELINE_REWIND_MS);
      return;
    }
    this.startPlaybackLoop(timeline.end);
  }

  private startPlaybackLoop(end: Eu5DateComponents): void {
    this.updateState(() => ({ timelinePlayback: "playing" }));

    // Wall-clock pacing: the requested date advances at the chosen rate even
    // when the worker cannot render every day, and the coalescing above lets
    // the map skip ahead to the newest date.
    let last = performance.now();
    let carry = 0;
    const frame = (now: number) => {
      carry += ((now - last) / 1000) * TIMELINE_DAYS_PER_SECOND;
      last = now;
      const days = Math.floor(carry);
      if (days >= 1) {
        carry -= days;
        const next = addDays(this._state.timelineDate, days);
        this.handleSetTimelineDate(next);
        if (sameDate(this._state.timelineDate, end)) {
          // Playback has run its course: rest at the save date and offer a
          // replay, rather than turning back into a plain Play.
          this.playbackFrame = null;
          this.updateState(() => ({ timelinePlayback: "ended" }));
          return;
        }
      }
      this.playbackFrame = requestAnimationFrame(frame);
    };
    this.playbackFrame = requestAnimationFrame(frame);
  }

  private handlePauseTimeline(): void {
    if (this.playbackFrame !== null) {
      cancelAnimationFrame(this.playbackFrame);
      this.playbackFrame = null;
    }
    if (this.rewindTimer !== null) {
      clearTimeout(this.rewindTimer);
      this.rewindTimer = null;
    }
    if (this.isTimelineRunning()) {
      this.updateState(() => ({ timelinePlayback: "paused" }));
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

  private async handleGetStateEfficacy(): Promise<StateEfficacyInsightData> {
    return await this.gameInstance.getStateEfficacy();
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
  onProgress?: (increment: number, stage: string) => void,
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

  const [metadata, paletteGradients, timeline] = await Promise.all([
    gameInstance.getSaveMetadata(),
    gameInstance.getPaletteGradients(),
    gameInstance.getTimeline(),
  ]);

  const engine = new Eu5UIEngine(gameInstance, workers, paletteGradients, timeline);
  return {
    engine,
    saveDate: metadata.date,
    playthroughName: metadata.playthroughName,
  };
}
