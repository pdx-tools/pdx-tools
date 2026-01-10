import { Eu5GameAdapter } from "./game-adapter";
import type {
  GameInstance,
  HoverDisplayData,
  MapModeRange,
} from "./game-adapter";
import type { Eu5SaveInput } from "./store/useLoadEu5";
import type { MapMode } from "@/wasm/wasm_eu5";

export interface PointerPosition {
  x: number;
  y: number;
}

export interface ZoomParams {
  center: PointerPosition;
  delta: number;
}

export interface PanParams {
  delta: PointerPosition;
}

export interface DragHandle {
  update(pos: PointerPosition): Promise<void>;
  end(): Promise<void>;
}

export interface AppState {
  currentMapMode: MapMode;
  hoverDisplayData: HoverDisplayData | null;
  isGeneratingScreenshot: boolean;
  canvasSize: { width: number; height: number };
  ownerBordersEnabled: boolean;
  mapModeRange: MapModeRange | null;
}

export interface GestureState {
  distance: number;
  center: PointerPosition;
}

export interface PointerInfo {
  x: number;
  y: number;
  startTime: number;
}

export type AppStateListener = (state: AppState) => void;
export type AppStateSelector<T> = (state: AppState) => T;

export interface AppTriggers {
  mouseMove(pos: PointerPosition): Promise<void>;
  mouseDown(pos: PointerPosition): Promise<DragHandle>;
  mouseUp(): Promise<void>;
  mouseLeave(): Promise<void>;
  click(pos: PointerPosition): Promise<void>;

  pointerStart(
    pos: PointerPosition,
    pointerId: number,
  ): Promise<DragHandle | void>;
  pointerMove(pos: PointerPosition, pointerId: number): Promise<void>;
  pointerEnd(pointerId: number): Promise<void>;
  pointerCancel(pointerId: number): Promise<void>;

  zoom(params: ZoomParams): Promise<void>;
  pan(params: PanParams): Promise<void>;

  selectMapMode(mode: MapMode): Promise<void>;
  generateScreenshot(fullResolution: boolean): Promise<Blob>;
  resize(width: number, height: number): Promise<void>;
  toggleOwnerBorders(): Promise<void>;
  getLocationArrays(): Promise<Blob>;
  melt(): Promise<Uint8Array<ArrayBuffer>>;
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
  private pointers = new Map<number, PointerInfo>();
  private lastGesture: GestureState | null = null;
  private rafId: number | null = null;
  private currentDragHandle: DragHandle | null = null;

  constructor(
    private gameInstance: GameInstance,
    private workers: Eu5GameAdapter,
    initialState?: Partial<AppState>,
  ) {
    this._state = {
      currentMapMode: "political",
      hoverDisplayData: null,
      isGeneratingScreenshot: false,
      canvasSize: { width: 600, height: 400 },
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
    mouseMove: (pos) => this.handleMouseMove(pos),
    mouseDown: (pos) => this.handleMouseDown(pos),
    mouseUp: () => this.handleMouseUp(),
    mouseLeave: () => this.handleMouseLeave(),
    click: (pos) => this.handleClick(pos),

    pointerStart: (pos, pointerId) => this.handlePointerStart(pos, pointerId),
    pointerMove: (pos, pointerId) => this.handlePointerMove(pos, pointerId),
    pointerEnd: (pointerId) => this.handlePointerEnd(pointerId),
    pointerCancel: (pointerId) => this.handlePointerCancel(pointerId),

    zoom: (params) => this.handleZoom(params),
    pan: (params) => this.handlePan(params),

    selectMapMode: (mode) => this.handleSelectMapMode(mode),
    generateScreenshot: (fullResolution) =>
      this.handleGenerateScreenshot(fullResolution),
    resize: (width, height) => this.handleResize(width, height),
    toggleOwnerBorders: () => this.handleToggleOwnerBorders(),
    getLocationArrays: () => this.handleGetLocationArrays(),
    melt: () => this.handleMelt(),
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
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.gameInstance.stopHoverTracking();
    this.workers.terminate();
    this.listeners.clear();
    this.pointers.clear();
  }

  private updateState(updater: (state: AppState) => Partial<AppState>): void {
    const updates = updater(this._state);
    this._state = { ...this._state, ...updates };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  private async handleMouseMove(pos: PointerPosition): Promise<void> {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    this.rafId = requestAnimationFrame(async () => {
      this.rafId = null;

      // Input controller handles drag internally based on state
      await this.gameInstance.onCursorMove(pos.x, pos.y);
      // Also update cursor world position for hover tracking
      await this.gameInstance.updateCursorWorldPosition(pos.x, pos.y);
    });
  }

  private async handleMouseDown(pos: PointerPosition): Promise<DragHandle> {
    // Update cursor position and start drag with left button (button 0)
    await this.gameInstance.onCursorMove(pos.x, pos.y);
    await this.gameInstance.onMouseButton(0, true);

    const dragHandle = this.createDragHandle();
    this.currentDragHandle = dragHandle;
    return dragHandle;
  }

  private async handleMouseUp(): Promise<void> {
    // End drag with left button (button 0)
    await this.gameInstance.onMouseButton(0, false);
    this.currentDragHandle = null;
  }

  private async handleMouseLeave(): Promise<void> {
    // End drag if active
    await this.gameInstance.onMouseButton(0, false);
    this.currentDragHandle = null;
    // Clear cursor position in worker when mouse leaves
    await this.gameInstance.updateCursorWorldPosition(-1, -1);
  }

  private async handleClick(_pos: PointerPosition): Promise<void> {
    // Currently commented out in original App.tsx, keeping for future use
  }

  private async handlePointerStart(
    pos: PointerPosition,
    pointerId: number,
  ): Promise<DragHandle | void> {
    this.pointers.set(pointerId, { ...pos, startTime: Date.now() });

    if (this.pointers.size === 1) {
      return this.handleMouseDown(pos);
    } else if (this.pointers.size === 2) {
      this.startGesture();
      return;
    }
  }

  private async handlePointerMove(
    pos: PointerPosition,
    pointerId: number,
  ): Promise<void> {
    const pointer = this.pointers.get(pointerId);
    if (!pointer) return;

    this.pointers.set(pointerId, { ...pos, startTime: pointer.startTime });

    if (this.pointers.size === 1) {
      await this.handleMouseMove(pos);
    } else if (this.pointers.size === 2) {
      await this.updateGesture();
    }
  }

  private async handlePointerEnd(pointerId: number): Promise<void> {
    this.pointers.delete(pointerId);

    if (this.pointers.size === 0) {
      await this.handleMouseUp();
      this.lastGesture = null;
    } else if (this.pointers.size === 1) {
      this.lastGesture = null;
    }
  }

  private async handlePointerCancel(pointerId: number): Promise<void> {
    await this.handlePointerEnd(pointerId);
  }

  private async handleZoom(params: ZoomParams): Promise<void> {
    // Convert zoom delta to scroll lines
    // delta > 1.0 means zoom in (positive scroll lines)
    // delta < 1.0 means zoom out (negative scroll lines)
    const scrollLines =
      params.delta > 1.0
        ? Math.log(params.delta) / Math.log(1.1)
        : -Math.log(1.0 / params.delta) / Math.log(1.1);

    // Update cursor position first, then scroll
    await this.gameInstance.onCursorMove(params.center.x, params.center.y);
    await this.gameInstance.onScroll(scrollLines);
  }

  private async handlePan(_params: PanParams): Promise<void> {
    // Pan is handled through drag mechanism in the current implementation
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

  private async handleGenerateScreenshot(
    fullResolution: boolean,
  ): Promise<Blob> {
    if (this._state.isGeneratingScreenshot) {
      throw new Error("Screenshot generation already in progress");
    }

    this.updateState(() => ({ isGeneratingScreenshot: true }));

    try {
      const blob =
        await this.gameInstance.generateWorldScreenshot(fullResolution);
      return blob;
    } finally {
      this.updateState(() => ({ isGeneratingScreenshot: false }));
    }
  }

  private async handleMelt(): Promise<Uint8Array<ArrayBuffer>> {
    return await this.gameInstance.melt();
  }

  private async handleResize(width: number, height: number): Promise<void> {
    const snapToDevicePixel = (size: number, ratio: number) => {
      const physicalSize = Math.floor(size * ratio);
      const logical = Math.floor(physicalSize / ratio);
      return { logical, physical: physicalSize };
    };

    const snappedWidth = snapToDevicePixel(width, window.devicePixelRatio);
    const snappedHeight = snapToDevicePixel(height, window.devicePixelRatio);

    await this.gameInstance.resize(snappedWidth.logical, snappedHeight.logical);

    this.updateState(() => ({
      canvasSize: {
        width: snappedWidth.logical,
        height: snappedHeight.logical,
      },
    }));
  }

  private startGesture(): void {
    if (this.pointers.size !== 2) return;

    const [p1, p2] = Array.from(this.pointers.values());
    const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    this.lastGesture = { distance, center };
  }

  private async updateGesture(): Promise<void> {
    if (this.pointers.size !== 2 || !this.lastGesture) return;

    const [p1, p2] = Array.from(this.pointers.values());
    const currentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const currentCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    const zoomDelta = currentDistance / this.lastGesture.distance;
    await this.handleZoom({ center: currentCenter, delta: zoomDelta });

    this.lastGesture = { distance: currentDistance, center: currentCenter };
  }

  private createDragHandle(): DragHandle {
    return {
      update: async (pos: PointerPosition) => {
        // Input controller handles drag internally
        await this.gameInstance.onCursorMove(pos.x, pos.y);
      },
      end: async () => {
        await this.gameInstance.onMouseButton(0, false);
        this.currentDragHandle = null;
      },
    };
  }
}

// Factory function for creating a loaded engine after save loading
export async function createLoadedEngine(
  saveInput: Eu5SaveInput,
  canvas: {
    offscreen: OffscreenCanvas;
    container: HTMLElement;
  },
  onProgress?: (increment: number) => void,
): Promise<{ engine: AppEngine; saveDate: string; playthroughName: string }> {
  const { offscreen, container } = canvas;

  const bounds = container.getBoundingClientRect();
  const snapToDevicePixel = (size: number, ratio: number) => {
    const physicalSize = Math.floor(size * ratio);
    const logical = Math.floor(physicalSize / ratio);
    return { logical, physical: physicalSize };
  };

  const snappedWidth = snapToDevicePixel(bounds.width, window.devicePixelRatio);
  const snappedHeight = snapToDevicePixel(
    bounds.height,
    window.devicePixelRatio,
  );

  offscreen.width = snappedWidth.logical;
  offscreen.height = snappedHeight.logical;

  const workers = Eu5GameAdapter.create();
  const gameInstance = await workers.newSave(
    {
      canvas: offscreen,
      display: {
        width: snappedWidth.logical,
        height: snappedHeight.logical,
        scaleFactor: window.devicePixelRatio,
      },
      save: saveInput,
    },
    onProgress,
  );

  const metadata = await gameInstance.getSaveMetadata();

  const initialState: Partial<AppState> = {
    canvasSize: { width: snappedWidth.logical, height: snappedHeight.logical },
  };

  const engine = new Eu5UIEngine(gameInstance, workers, initialState);
  return {
    engine,
    saveDate: metadata.date,
    playthroughName: metadata.playthroughName,
  };
}
