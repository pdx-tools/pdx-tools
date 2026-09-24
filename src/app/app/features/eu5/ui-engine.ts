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
import {
  addDays,
  addMonths,
  addYears,
  clampDate,
  daysBetween,
  sameDate,
} from "@/features/timeline/date";
import { TIMELAPSE_FPS, timelapsePlan } from "@pdx.tools/timelapse";
import { readDatePlateColors, readDatePlateFonts } from "@/features/timeline/datePlate";
import type { MapViewport, TimelapseFile, TimelapseOptions } from "@pdx.tools/timelapse";
import type {
  TimelapseProgress,
  TimelapseStatus,
  TimelinePlayback,
  TimelineStepUnit,
} from "@/features/timeline/controller";
import type { Eu5ParsedSave, Eu5SaveInput } from "./store/types";
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
  PopulationGrowthInsightData,
  WorldSummary,
  BuildingLevelsInsightData,
  ReligionInsightData,
  RgoInsightData,
  ControlInsightData,
  PoliticalWorldScoreboard,
  Eu5DateComponents,
  Eu5PlayerData,
} from "@/wasm/wasm_eu5";
import type { CanvasSize, SharedCanvasInputConfig } from "@/lib/canvas_courier";
import { log } from "@/lib/log";
import { formatInt } from "@/lib/format";

type TimelapsePhase = "date" | "render" | "encode" | "hop" | "pace" | "finish";

/**
 * Where the time of a recording goes, one phase at a time, so the log can
 * say whether a slow export is the game worker, the render, the encoder, or
 * the messages between them.
 */
class TimelapseTiming {
  frames = 0;
  /** Frames that waited for the film's cadence; the rest ran unpaced. */
  paced = 0;
  private readonly start = performance.now();
  private readonly ms: Record<TimelapsePhase, number> = {
    date: 0,
    render: 0,
    encode: 0,
    hop: 0,
    pace: 0,
    finish: 0,
  };

  add(phase: TimelapsePhase, ms: number) {
    this.ms[phase] += ms;
  }

  /** Charge the time since `since` to `phase`; returns now, for the next lap. */
  lap(phase: TimelapsePhase, since: number): number {
    const now = performance.now();
    this.ms[phase] += now - since;
    return now;
  }

  summary(): string {
    const total = performance.now() - this.start;
    const per = (phase: TimelapsePhase) =>
      `${phase} ${(this.ms[phase] / Math.max(1, this.frames)).toFixed(1)}`;
    const phases: TimelapsePhase[] = ["date", "render", "encode", "hop", "pace"];
    return (
      `timelapse timing: ${this.frames} frames in ${(total / 1000).toFixed(1)}s ` +
      `(${(total / Math.max(1, this.frames)).toFixed(1)}ms/frame): ` +
      phases.map(per).join(" · ") +
      ` · finish ${(this.ms.finish / 1000).toFixed(2)}s · paced ${this.paced}/${this.frames}`
    );
  }
}

/** Playback rate of the campaign timeline: one campaign year per real second. */
export const TIMELINE_DAYS_PER_SECOND = 365;

export type { TimelineStepUnit, TimelinePlayback, TimelapseStatus };

/** How long the playhead takes to glide back to the campaign start, in ms. */
export const TIMELINE_REWIND_MS = 420;

export type TimelapseState = TimelapseProgress;

const TIMELAPSE_IDLE: TimelapseState = { status: "idle", frame: 0, frames: 0 };

/** A finished recording: the file and the extension it should be saved under. */
export type TimelapseRecording = TimelapseFile;

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
  timelapse: TimelapseState;
  /**
   * Where the live map is looking, in world units. Null until the first
   * frame has rendered.
   */
  mapViewport: MapViewport | null;
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
  /**
   * Record the whole campaign to a video file. Resolves with the file, or
   * with null when the recording was stopped before it finished.
   */
  recordTimelapse(options: TimelapseOptions): Promise<TimelapseRecording | null>;
  /** Stop a recording in progress and discard what it had encoded. */
  stopTimelapse(): void;
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
  getPopulationGrowthInsight(): Promise<PopulationGrowthInsightData>;
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
  /** The date request in flight, so a recording can wait for it to settle. */
  private timelineRequest: Promise<void> | null = null;
  private playbackFrame: number | null = null;
  private rewindTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set by `stopTimelapse`, read between frames of a recording. */
  private timelapseStopped = false;

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
      timelapse: TIMELAPSE_IDLE,
      mapViewport: null,
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

    this.gameInstance.onViewportChange((viewport) => {
      this.updateState(() => ({ mapViewport: viewport }));
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
    recordTimelapse: (options) => this.handleRecordTimelapse(options),
    stopTimelapse: () => this.handleStopTimelapse(),
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
    getPopulationGrowthInsight: () => this.gameInstance.getPopulationGrowthInsight(),
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
    // A recording owns the map until it is done; a mode change mid-film would
    // pull the date to the save and spoil what has been encoded.
    if (this.isTimelapseRunning()) return;

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
    if (!timeline.available || this.isTimelapseRunning()) return;
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
    this.timelineRequest = this.sendTimelineDate(clamped);
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
    if (!timeline.available || this.isTimelineRunning() || this.isTimelapseRunning()) return;

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

  private isTimelapseRunning(): boolean {
    return this._state.timelapse.status !== "idle";
  }

  /** Stop a recording at the frame it is on; the loop reads the flag between frames. */
  private handleStopTimelapse(): void {
    if (!this.isTimelapseRunning()) return;
    this.timelapseStopped = true;
  }

  /**
   * Run the campaign past a video encoder, a frame at a time.
   *
   * Each frame is rendered on a surface of the output's own size rather than
   * copied off the visible canvas, so the film does not inherit the size of
   * the player's window. The date is set and awaited per frame instead of
   * going through the coalescing path: a dropped date here is a dropped frame.
   *
   * This thread only relays: the game worker settles the date, the map worker
   * renders and encodes the frame.
   *
   * While the tab is visible the loop keeps to the film's own frame rate, so
   * the map on screen plays the film as it is written: every frame is shown,
   * at the pace it will play, and the export takes as long as the film the
   * panel quoted. The wait is on a schedule, not on the display, so a slow
   * frame is not doubled by a missed refresh. With the tab hidden nobody is
   * watching, and the loop runs as fast as the encoder takes frames.
   */
  private async handleRecordTimelapse(
    options: TimelapseOptions,
  ): Promise<TimelapseRecording | null> {
    const timeline = this._state.timeline;
    if (!timeline.available) {
      throw new Error("This save has no border history to record");
    }
    if (this.isTimelapseRunning()) {
      throw new Error("A timelapse recording is already running");
    }

    this.handlePauseTimeline();
    this.timelapseStopped = false;
    const resumeDate = this._state.timelineDate;

    // A date the player's last drag left in flight would otherwise answer in
    // the middle of the film, so it settles first.
    await this.timelineRequest?.catch(() => {});
    this.timelineQueued = null;

    const plan = timelapsePlan({
      totalDays: daysBetween(timeline.start, timeline.end),
      options,
    });
    const output = { width: plan.quality.width, height: plan.quality.height };

    this.updateState(() => ({
      timelapse: { status: "recording", frame: 0, frames: plan.frames },
    }));

    const timing = new TimelapseTiming();
    const frameMs = 1000 / TIMELAPSE_FPS;
    try {
      // Framing is read before the first date is set, so the current view is
      // the one the player was looking at when they pressed record. The plate's
      // colors and fonts are read here, where the document is.
      await this.gameInstance.beginTimelapseRecording({
        framing: options.framing,
        output,
        colors: readDatePlateColors(),
        fonts: readDatePlateFonts(),
      });

      // When the frame on screen should give way to the next one.
      let due = performance.now();
      for (let frame = 0; frame < plan.frames; frame += 1) {
        if (this.timelapseStopped) return null;
        due += frameMs;

        // The last frame lands exactly on the save date, whatever rounding
        // did to the frames before it.
        const date =
          frame === plan.frames - 1
            ? timeline.end
            : addDays(timeline.start, Math.round(frame * plan.daysPerFrame));

        let t = performance.now();
        const change = await this.gameInstance.setTimelineDate(date);
        this.applyTimelineChange(change);
        t = timing.lap("date", t);
        const { renderMs, encodeMs } = await this.gameInstance.recordTimelapseFrame(change.date);
        timing.add("render", renderMs);
        timing.add("encode", encodeMs);
        timing.add("hop", performance.now() - t - renderMs - encodeMs);
        timing.frames += 1;

        this.updateState(() => ({
          timelapse: { status: "recording", frame: frame + 1, frames: plan.frames },
        }));

        const now = performance.now();
        if (document.visibilityState !== "visible" || now >= due) {
          // Nobody watching, or a frame that ran long: the schedule restarts
          // here rather than racing, or stalling, to catch up.
          due = now;
        } else {
          await new Promise((resolve) => setTimeout(resolve, due - now));
          timing.lap("pace", now);
          timing.paced += 1;
        }
      }

      this.updateState((state) => ({
        timelapse: { ...state.timelapse, status: "encoding" },
      }));
      const finishStart = performance.now();
      const file = await this.gameInstance.finishTimelapseRecording();
      timing.lap("finish", finishStart);
      // The panel quoted an estimate; the gap between it and the file is what
      // tells us whether the estimate is honest.
      log(`timelapse file: ${formatInt(file.blob.size)} bytes, planned ${formatInt(plan.bytes)}`);
      return file;
    } finally {
      log(timing.summary());
      // A recording that was finished is already closed; a stopped or failed
      // one is discarded here.
      await this.gameInstance.endTimelapseRecording();
      this.updateState(() => ({ timelapse: TIMELAPSE_IDLE }));
      // Put the map back on the date the player left it on.
      this.handleSetTimelineDate(resumeDate);
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
  save: Eu5ParsedSave;
  saveDate: Eu5DateComponents;
  playthroughName: string;
  /** Human players in save order. Empty for observer games. */
  players: Eu5PlayerData[];
  world: WorldSummary;
}> {
  const { offscreen, display, inputConfig } = canvas;
  const save: Eu5ParsedSave =
    saveInput.kind === "handle"
      ? { kind: "file", file: await saveInput.file.getFile() }
      : saveInput;

  const workers = Eu5GameAdapter.create();
  const gameInstance = await workers.newSave(
    {
      canvas: offscreen,
      display,
      inputConfig,
      save,
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
    save,
    saveDate: metadata.date,
    playthroughName: metadata.playthroughName,
    players: metadata.players,
    world: metadata.world,
  };
}
