import { timeAsync, timeSync } from "@/lib/timeit";
import { log } from "@/lib/log";
import init, {
  Eu5CanvasSurface,
  Eu5WasmMapRenderer,
  Eu5WasmMapBundle,
  location_borders_at_zoom,
  setup_eu5_map_wasm,
} from "../../../../wasm/wasm_eu5_map";
import type { CanvasDisplay, LogLevel } from "../../../../wasm/wasm_eu5_map";
import wasmPath from "../../../../wasm/wasm_eu5_map_bg.wasm?url";
import { proxy, expose } from "comlink";
import { formatInt } from "@/lib/format";
import type { ScreenshotOverlayData, TableCell } from "@/wasm/wasm_eu5";
import {
  SharedCanvasInputReader,
  SharedCanvasEventType,
  SharedCanvasEventAction,
  SharedCanvasModifierBits,
  WebKeyCode,
} from "@/lib/canvas_courier";
import type { SharedCanvasInputConfig, SharedCanvasDecodedEvent } from "@/lib/canvas_courier";
import type {
  BoxSelectOperation,
  BoxSelectOverlayRect,
  BoxSelectCommitEvent,
} from "../../types/box-select";
import { layoutTimelapseFrame } from "@pdx.tools/timelapse";
import type {
  DatePlateColors,
  DatePlateFonts,
  MapViewport,
  TimelapseEncoder,
  TimelapseFile,
  TimelapseFraming,
  TimelapseFrameLayout,
  TimelapseFrameTiming,
} from "@pdx.tools/timelapse";
import type { Eu5DateComponents } from "@/wasm/wasm_eu5";

// Reverse lookup: numeric WebKeyCode value → string key code name
const webKeyCodeToString = Object.fromEntries(
  Object.entries(WebKeyCode).map(([name, value]) => [value as number, name]),
) as Record<number, string>;

const initialized = (async () => {
  await timeAsync("Load EU5 Map Wasm module", () => init({ module_or_path: wasmPath }));
})();

let appResolve: (value: Eu5WasmMapRenderer | PromiseLike<Eu5WasmMapRenderer>) => void;
let appReject: (reason?: any) => void;
let appTask = new Promise<Eu5WasmMapRenderer>((res, rej) => {
  appResolve = res;
  appReject = rej;
});
let hoverEventCallback: ((event: LocationHoverChangeEvent) => void) | null = null;
let clickEventCallback: ((event: LocationClickChangeEvent) => void) | null = null;
let zoomChangeCallback: ((zoom: number) => void) | null = null;
let boxSelectCommitCallback: ((event: BoxSelectCommitEvent) => void) | null = null;
let boxSelectRectCallback: ((rect: BoxSelectOverlayRect | null) => void) | null = null;
let cursorHintCallback: ((hint: CursorHint) => void) | null = null;
let lastCursorHint: CursorHint | null = null;
let viewportCallback: ((viewport: MapViewport) => void) | null = null;
let lastViewport: MapViewport | null = null;
let newGroupingTable: Uint32Array | null = null;
let newMapData: MapDataSync | null = null;
let renderOrQueue: () => void = () => {};

/**
 * A recording in progress. The surface is its own, so the film's size and
 * framing never follow the window the player happens to have open, and the
 * map they are watching stays interactive underneath. The encoder sits
 * beside the surface: a frame goes from the GPU into the file without
 * leaving this thread.
 */
type Recording = {
  /** The surface the frames are rendered to, at the band's own size. */
  canvas: OffscreenCanvas;
  renderer: ReturnType<Eu5WasmMapRenderer["create_screenshot_renderer"]>;
  encoder: TimelapseEncoder;
  /** The world rectangle every frame shows, in world units. */
  rect: { x: number; y: number; width: number; height: number };
};

export type { TimelapseFile, TimelapseFrameTiming };

let recording: Recording | null = null;
let newLocations: Uint32Array | null = null;
let newDimensions: {
  width: number;
  height: number;
  scaleFactor: number;
} | null = null;
let lastCursorPosition: { x: number; y: number } | null = null;
let mouseDownPos: { x: number; y: number } | null = null;
const pressedKeys = new Set<string>();

const mapGameEndpoint = () => {
  return {
    async syncLocationData(locationArray: Uint32Array) {
      newLocations = locationArray;
      renderOrQueue();
    },

    async syncGroupingTable(raw: Uint32Array) {
      newGroupingTable = raw;
    },

    async syncMapData(data: MapDataSync) {
      // A later buffer replaces an earlier pending one of the same kind.
      newMapData = {
        colors: data.colors ?? newMapData?.colors,
        flags: data.flags ?? newMapData?.flags,
      };
      renderOrQueue();
    },

    async center_at_color_id(color_id: number) {
      const app = await appTask;
      timeSync("Centering map over capital", () => app.center_at_color_id(color_id));
    },

    onLocationHoverUpdate: (callback: (event: LocationHoverChangeEvent) => void) => {
      hoverEventCallback = callback;
    },

    onLocationClickUpdate: (callback: (event: LocationClickChangeEvent) => void) => {
      clickEventCallback = callback;
    },

    onZoomChange: (callback: (rawZoom: number) => void) => {
      zoomChangeCallback = callback;
    },

    onBoxSelectCommit: (callback: (event: BoxSelectCommitEvent) => void) => {
      boxSelectCommitCallback = callback;
    },

    onCursorHintUpdate: (callback: (hint: CursorHint) => void) => {
      cursorHintCallback = callback;
      if (lastCursorHint !== null) callback(lastCursorHint);
    },
  };
};

export type Eu5MapEndpoint = ReturnType<typeof mapGameEndpoint>;

const emitCursor = (hint: CursorHint) => {
  if (hint === lastCursorHint) return;
  lastCursorHint = hint;
  cursorHintCallback?.(hint);
};

export const createMapEngine = async (
  {
    canvas,
    display,
    inputConfig,
  }: {
    canvas: OffscreenCanvas;
    display: CanvasDisplay;
    inputConfig: SharedCanvasInputConfig;
  },
  {
    mapBundle,
    onProgress,
  }: {
    mapBundle: { fetch: () => Promise<Uint8Array> };
    onProgress?: (increment: number, stage: string) => void;
  },
) => {
  let prevDimensions = {
    width: display.width,
    height: display.height,
    scaleFactor: display.scaleFactor,
  };
  await initialized;
  onProgress?.(5, "Preparing canvas");

  const canvasInit = await timeAsync("Canvas Initialization", () =>
    Eu5CanvasSurface.init(canvas, display),
  );
  onProgress?.(5, "Loading map data");

  const bundle = await mapBundle.fetch();

  const mapBundleWasm = Eu5WasmMapBundle.open(bundle);
  const textureData = timeSync("Create Texture Data", () => mapBundleWasm.load_texture_data());

  const westView = timeSync("Upload Texture Data (West)", () =>
    canvasInit.upload_west_texture(textureData),
  );
  onProgress?.(12, "Building map textures");

  const eastView = timeSync("Upload Texture Data (East)", () =>
    canvasInit.upload_east_texture(textureData),
  );
  onProgress?.(12, "Starting renderer");

  try {
    const app = timeSync("Create Renderer", () =>
      Eu5WasmMapRenderer.create(canvasInit, westView, eastView, textureData),
    );
    onProgress?.(6, "Rendering map");
    appResolve(app);
  } catch (e) {
    appReject(e);
    throw e;
  }

  const app = await appTask;

  // Send initial zoom level to game worker
  const initialZoom = app.get_zoom();
  zoomChangeCallback?.(initialZoom);

  let hoverTrackingActive = false;
  let lastKnownLocationId: number | null = null;
  let lastProcessedWorldCoordinates: { x: number; y: number } | null = null;
  let boxDrag: BoxSelectDrag | null = null;
  let boxDragDirty = false;

  let _dirtyRender: boolean = false;
  renderOrQueue = () => {
    _dirtyRender = true;
  };

  const startHoverTracking = () => {
    hoverTrackingActive = true;
  };

  const stopHoverTracking = () => {
    hoverTrackingActive = false;
    lastProcessedWorldCoordinates = null;
    if (lastKnownLocationId !== null) {
      hoverEventCallback?.({ kind: "clear" });
    }
    lastKnownLocationId = null;
  };

  const hasBoxSelectModifier = (modifiers?: number): boolean => {
    if (modifiers !== undefined) {
      return (
        (modifiers & SharedCanvasModifierBits.Shift) !== 0 ||
        (modifiers & SharedCanvasModifierBits.Alt) !== 0 ||
        (modifiers & SharedCanvasModifierBits.Ctrl) !== 0
      );
    }
    return (
      pressedKeys.has("ShiftLeft") ||
      pressedKeys.has("ShiftRight") ||
      pressedKeys.has("AltLeft") ||
      pressedKeys.has("AltRight") ||
      pressedKeys.has("ControlLeft") ||
      pressedKeys.has("ControlRight")
    );
  };

  const updateCursorWorldPosition = (canvasX: number, canvasY: number) => {
    if (!hoverTrackingActive) {
      return;
    }

    // Handle clearing cursor position (when mouse leaves canvas)
    if (canvasX < 0 || canvasY < 0) {
      lastCursorPosition = null;
      if (lastKnownLocationId !== null) {
        hoverEventCallback?.({ kind: "clear" });
      }
      lastKnownLocationId = null;
      lastProcessedWorldCoordinates = null;
      return;
    }

    lastCursorPosition = { x: canvasX, y: canvasY };

    const worldPos = app.canvas_to_world();
    const worldCoordinates = { x: worldPos[0], y: worldPos[1] };

    const threshold = 1.0;
    const hasChanged =
      !lastProcessedWorldCoordinates ||
      Math.abs(worldCoordinates.x - lastProcessedWorldCoordinates.x) >= threshold ||
      Math.abs(worldCoordinates.y - lastProcessedWorldCoordinates.y) >= threshold;

    if (!hasChanged) {
      return;
    }

    lastProcessedWorldCoordinates = worldCoordinates;

    try {
      const gpuLoc = app.pick_location();
      let locationId = app.gpu_loc_to_app(gpuLoc);
      if (locationId !== lastKnownLocationId) {
        hoverEventCallback?.({ kind: "update", locationIdx: locationId });
        lastKnownLocationId = locationId || null;
      }
    } catch (error) {
      console.error("Error in CPU hover lookup:", error);
    }
  };

  const normalizeBoxRect = (drag: BoxSelectDrag): BoxSelectOverlayRect => {
    const left = Math.min(drag.start.x, drag.current.x);
    const top = Math.min(drag.start.y, drag.current.y);
    return {
      left,
      top,
      width: Math.abs(drag.current.x - drag.start.x),
      height: Math.abs(drag.current.y - drag.start.y),
      operation: drag.operation,
    };
  };

  const updateBoxSelect = (drag: BoxSelectDrag) => {
    boxSelectRectCallback?.(normalizeBoxRect(drag));
    if (drag.resolution === "location") {
      app.preview_box_highlight_locations(
        drag.start.x,
        drag.start.y,
        drag.current.x,
        drag.current.y,
      );
    } else {
      app.preview_box_highlight(drag.start.x, drag.start.y, drag.current.x, drag.current.y);
    }
  };

  const cancelBoxSelect = () => {
    if (boxDrag === null) {
      return;
    }
    app.clear_box_highlight();
    boxDrag = null;
    boxDragDirty = false;
    boxSelectRectCallback?.(null);
  };

  const processInputEvent = (event: SharedCanvasDecodedEvent) => {
    switch (event.type) {
      case SharedCanvasEventType.Pointer: {
        const { action, x, y, button, modifiers } = event;
        if (action === SharedCanvasEventAction.Move) {
          app.on_cursor_move(x, y);
          lastCursorPosition = { x, y };
          if (boxDrag !== null) {
            boxDrag.current = { x, y };
            boxDragDirty = true;
          } else {
            updateCursorWorldPosition(x, y);
          }
          if (boxDrag !== null) {
            emitCursor("crosshair");
          } else if (mouseDownPos !== null) {
            const dist = Math.hypot(x - mouseDownPos.x, y - mouseDownPos.y);
            if (dist >= 5) emitCursor("move");
          } else {
            emitCursor(hasBoxSelectModifier(modifiers) ? "crosshair" : "default");
          }
          renderOrQueue();
        } else if (action === SharedCanvasEventAction.Down) {
          app.on_cursor_move(x, y);
          lastCursorPosition = { x, y };
          const useBoxSelect =
            button === 0 &&
            ((modifiers & SharedCanvasModifierBits.Shift) !== 0 ||
              (modifiers & SharedCanvasModifierBits.Alt) !== 0 ||
              (modifiers & SharedCanvasModifierBits.Ctrl) !== 0);
          if (useBoxSelect) {
            const isCtrl = (modifiers & SharedCanvasModifierBits.Ctrl) !== 0;
            const isAlt = (modifiers & SharedCanvasModifierBits.Alt) !== 0;
            const isShift = (modifiers & SharedCanvasModifierBits.Shift) !== 0;
            const operation: BoxSelectOperation = isAlt
              ? "remove"
              : isCtrl && !isShift
                ? "replace"
                : "add";
            const resolution = isCtrl ? "location" : "entity";
            boxDrag = {
              start: { x, y },
              current: { x, y },
              operation,
              resolution,
            };
            mouseDownPos = null;
            if (lastKnownLocationId !== null) {
              hoverEventCallback?.({ kind: "clear" });
              lastKnownLocationId = null;
            }
            updateBoxSelect(boxDrag);
            emitCursor("crosshair");
          } else {
            if (button === 0) {
              mouseDownPos = { x, y };
            }
            app.on_mouse_button(button >= 0 ? button : 0, true);
          }
          renderOrQueue();
        } else if (action === SharedCanvasEventAction.Up) {
          const btn = button >= 0 ? button : 0;
          if (btn === 0 && boxDrag !== null) {
            boxDrag.current = { x, y };
            const locationIdxs =
              boxDrag.resolution === "location"
                ? app.commit_box_selection_locations(
                    boxDrag.start.x,
                    boxDrag.start.y,
                    boxDrag.current.x,
                    boxDrag.current.y,
                  )
                : app.commit_box_selection(
                    boxDrag.start.x,
                    boxDrag.start.y,
                    boxDrag.current.x,
                    boxDrag.current.y,
                  );
            boxSelectCommitCallback?.({ locationIdxs, operation: boxDrag.operation });
            app.clear_box_highlight();
            boxDrag = null;
            boxDragDirty = false;
            boxSelectRectCallback?.(null);
          } else if (btn === 0 && mouseDownPos !== null) {
            const dist = Math.hypot(x - mouseDownPos.x, y - mouseDownPos.y);
            if (dist < 5) {
              if (lastKnownLocationId !== null) {
                clickEventCallback?.({
                  kind: "update",
                  locationIdx: lastKnownLocationId,
                  modifiers,
                });
              } else {
                clickEventCallback?.({ kind: "clear" });
              }
            }
            mouseDownPos = null;
            app.on_mouse_button(btn, false);
          } else {
            app.on_mouse_button(btn, false);
          }
          emitCursor(hasBoxSelectModifier(modifiers) ? "crosshair" : "default");
          renderOrQueue();
        } else if (action === SharedCanvasEventAction.Leave) {
          cancelBoxSelect();
          app.on_mouse_button(0, false);
          mouseDownPos = null;
          lastCursorPosition = null;
          updateCursorWorldPosition(-1, -1);
          emitCursor("default");
          renderOrQueue();
        }
        break;
      }
      case SharedCanvasEventType.Keyboard: {
        const code = webKeyCodeToString[event.keyCode] ?? "Unknown";
        if (event.action === SharedCanvasEventAction.Down && !event.repeat) {
          pressedKeys.add(code);
          app.on_key_down(code);
        } else if (event.action === SharedCanvasEventAction.Up) {
          pressedKeys.delete(code);
          app.on_key_up(code);
        }
        if (mouseDownPos === null && boxDrag === null && lastCursorPosition !== null) {
          emitCursor(hasBoxSelectModifier() ? "crosshair" : "default");
        }
        break;
      }
      case SharedCanvasEventType.Wheel: {
        const scrollLines = event.deltaY < 0 ? 1 : -1;
        app.on_scroll(scrollLines);
        zoomChangeCallback?.(app.get_zoom());
        renderOrQueue();
        break;
      }
      case SharedCanvasEventType.Resize: {
        newDimensions = {
          width: event.width,
          height: event.height,
          scaleFactor: event.scaleFactor,
        };
        renderOrQueue();
        break;
      }
      default:
        break;
    }
  };

  // You would think that we should only render when dirty, but for some reason
  // firefox trips over itself and the clear color bleeds through. So for now we
  // just render every frame.
  let hasLocationInformation = false;

  // Location and grouping data arrive from the game worker between frames
  // and reach the GPU here, at the next use: the top of the render loop, or
  // a recorded frame, which cannot wait for the loop.
  const applyPendingSync = () => {
    if (newLocations) {
      hasLocationInformation = true;
      app.sync_location_array(newLocations);
      newLocations = null;
    }
    if (newMapData) {
      if (newMapData.colors) {
        app.sync_color_array(newMapData.colors);
      }
      if (newMapData.flags) {
        app.sync_flag_array(newMapData.flags);
      }
      newMapData = null;
    }
    if (newGroupingTable) {
      app.sync_grouping_table(newGroupingTable);
      newGroupingTable = null;
    }
  };

  const rafRender = async () => {
    // Sync location data before draining events so that updateCursorWorldPosition
    // always has valid location arrays available when it calls gpu_loc_to_app.
    applyPendingSync();

    // Drain canvas_courier input events before ticking
    inputReader.drain(processInputEvent);
    if (boxDrag !== null && boxDragDirty) {
      updateBoxSelect(boxDrag);
      boxDragDirty = false;
    }

    if (newDimensions) {
      let diff =
        Math.abs(newDimensions.width - prevDimensions.width) +
        Math.abs(newDimensions.height - prevDimensions.height) +
        Math.abs(newDimensions.scaleFactor - prevDimensions.scaleFactor);

      if (diff >= 4) {
        prevDimensions = { ...newDimensions };
        // Firefox also needs to wait for queued work before resizing
        // otherwise it will freeze up
        await app.queued_work().wait();
        app.resize(newDimensions.width, newDimensions.height, newDimensions.scaleFactor);
      }

      newDimensions = null;
    }

    app.tick();
    if (pressedKeys.size > 0 && lastCursorPosition && boxDrag === null) {
      updateCursorWorldPosition(lastCursorPosition.x, lastCursorPosition.y);
    }
    publishViewport();

    if (hasLocationInformation) {
      app.render();
    }
    requestAnimationFrame(rafRender);
  };
  // Four integers read off the input state: cheap enough for every frame,
  // and the comparison keeps a resting map silent.
  const publishViewport = () => {
    const [x, y, width, height] = app.viewport_world_rect();
    const prev = lastViewport?.viewport;
    if (prev && prev.x === x && prev.y === y && prev.width === width && prev.height === height) {
      return;
    }
    const [worldWidth, worldHeight] = app.world_size();
    lastViewport = {
      world: { width: worldWidth, height: worldHeight },
      viewport: { x, y, width, height },
    };
    viewportCallback?.(lastViewport);
  };

  /** Release the recording's surface; the encoder is the caller's to settle. */
  const closeRecording = (): Recording | null => {
    const open = recording;
    recording = null;
    open?.renderer.free();
    return open;
  };

  let inputReader = new SharedCanvasInputReader(inputConfig);
  rafRender();

  return proxy({
    get_zoom: () => {
      return app.get_zoom();
    },
    generateWorldScreenshot: async (
      fullResolution: boolean,
      overlayData?: ScreenshotOverlayData,
    ): Promise<Blob> => {
      applyPendingSync();

      const output = fullResolution
        ? { width: 16384, height: 8192 }
        : { width: 8192, height: 4096 };

      const compositeCanvas = new OffscreenCanvas(output.width, output.height);
      const ctx = compositeCanvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get 2D context for composite canvas");
      }

      // Create small overlay canvas if provided (minimal memory footprint ~3MB vs 512MB)
      let overlayInfo: OverlayCanvasInfo | null = null;
      if (overlayData) {
        overlayInfo = createOverlayCanvas(overlayData, fullResolution, output.height);
      }

      // Create dedicated screenshot canvas for independent screenshot renderer
      const screenshotCanvas = new OffscreenCanvas(8192, 8192);

      // Create independent screenshot renderer
      const screenshotRenderer = app.create_screenshot_renderer(screenshotCanvas);
      try {
        // Render west tile using independent screenshot renderer
        screenshotRenderer.render_west_tile();
        ctx.drawImage(screenshotCanvas, 0, 0, output.width / 2, output.height);

        // Render east tile using independent screenshot renderer
        screenshotRenderer.render_east_tile();
        ctx.drawImage(screenshotCanvas, output.width / 2, 0, output.width / 2, output.height);

        // Composite the small overlay canvas on top if provided
        if (overlayInfo) {
          ctx.drawImage(overlayInfo.canvas, overlayInfo.x, overlayInfo.y);
        }

        // Convert composite canvas to PNG blob and return
        return await compositeCanvas.convertToBlob({ type: "image/png" });
      } finally {
        screenshotRenderer.free();
      }
    },

    /**
     * Open a recording and report the frame it will produce.
     *
     * The surface is independent of the visible canvas: it has the output's
     * own size and its own view of the world, so the player can keep using
     * the map while the film records, and a small window cannot shrink the
     * result. The encoder is opened with it, so the first frame can be
     * written the moment it is asked for.
     */
    beginTimelapseRecording: async ({
      framing,
      output,
      colors,
      fonts,
    }: {
      framing: TimelapseFraming;
      output: { width: number; height: number };
      colors: DatePlateColors;
      fonts: DatePlateFonts;
    }): Promise<TimelapseFrameLayout> => {
      await closeRecording()?.encoder.abort();

      const [worldWidth, worldHeight] = app.world_size();
      const [viewX, viewY, viewWidth, viewHeight] = app.viewport_world_rect();
      const layout = layoutTimelapseFrame({
        framing,
        viewport: { x: viewX, y: viewY, width: viewWidth, height: viewHeight },
        world: { width: worldWidth, height: worldHeight },
        output,
      });

      const canvas = new OffscreenCanvas(layout.band.width, layout.band.height);
      const renderer = app.create_screenshot_renderer(canvas);
      // Location borders follow the film's own zoom, as they follow the
      // player's on the live map. The whole world in a 1080p frame is far
      // below the zoom at which they read, and a film of it would carry them
      // as noise on every border; a close view keeps them.
      renderer.set_location_borders(
        location_borders_at_zoom(layout.band.width / layout.rect.width),
      );
      try {
        // Loaded on demand: the muxer is large, and most sessions never record.
        const { TimelapseEncoder } = await import("@pdx.tools/timelapse/encoder");
        const encoder = await TimelapseEncoder.create({ layout, output, colors, fonts, log });
        recording = { canvas, renderer, encoder, rect: layout.rect };
      } catch (e) {
        renderer.free();
        throw e;
      }
      return layout;
    },

    /**
     * Render and encode one frame of the open recording, for `date`.
     *
     * Call it once the game worker has answered for that date: its colors
     * are then waiting here, and go to the GPU before the frame is drawn.
     * The frame is rendered now rather than by the render loop, so a
     * recording never waits on the display's refresh, and runs on in a
     * background tab, where the loop stops.
     */
    recordTimelapseFrame: async (date: Eu5DateComponents): Promise<TimelapseFrameTiming> => {
      if (recording === null) {
        throw new Error("No timelapse recording is open");
      }
      const renderStart = performance.now();
      applyPendingSync();
      const { rect, canvas, encoder } = recording;
      recording.renderer.render_world_rect(rect.x, rect.y, rect.width, rect.height);
      const renderMs = performance.now() - renderStart;
      const encodeMs = await encoder.addFrame(canvas, date);
      return { renderMs, encodeMs };
    },

    /** Close the recording and write its file. */
    finishTimelapseRecording: async (): Promise<TimelapseFile> => {
      const open = closeRecording();
      if (open === null) {
        throw new Error("No timelapse recording is open");
      }
      const blob = await open.encoder.finish();
      return { blob, extension: open.encoder.extension };
    },

    /** Close the recording without a file. Nothing to do when none is open. */
    endTimelapseRecording: async (): Promise<void> => {
      await closeRecording()?.encoder.abort();
    },

    async execCommands(commands: MapCommand[]) {
      for (const command of commands) {
        switch (command.kind) {
          case "render": {
            renderOrQueue();
            break;
          }
          case "setOwnerBorders": {
            app.set_owner_borders(command.enabled);
            break;
          }
        }
      }
    },

    pan_to_color_id: (
      colorId: number,
      insets: { left: number; right: number; top: number; bottom: number },
    ) => {
      return app.pan_to_color_id(colorId, insets);
    },

    onBoxSelectRectUpdate: (callback: (rect: BoxSelectOverlayRect | null) => void) => {
      boxSelectRectCallback = callback;
    },

    onCursorHintUpdate: (callback: (hint: CursorHint) => void) => {
      cursorHintCallback = callback;
      if (lastCursorHint !== null) callback(lastCursorHint);
    },

    /**
     * Where the live map is looking, in world units, sent from the render
     * loop on the frames it changes. The subscriber gets the current view at
     * once, then one message per pan or zoom frame and none while the map
     * rests.
     */
    onViewportChange: (callback: (viewport: MapViewport) => void) => {
      viewportCallback = callback;
      if (lastViewport !== null) callback(lastViewport);
    },

    startHoverTracking: startHoverTracking,

    stopHoverTracking: stopHoverTracking,
  });
};

export type MapCommand = { kind: "setOwnerBorders"; enabled: boolean } | { kind: "render" };

/** The location buffers the game worker sends after a change. */
export type MapDataSync = {
  /** Primary, owner, and secondary colors. */
  colors?: Uint32Array;
  /** Interaction flags. */
  flags?: Uint32Array;
};

type BoxSelectDrag = {
  start: { x: number; y: number };
  current: { x: number; y: number };
  operation: BoxSelectOperation;
  resolution: "entity" | "location";
};

export type LocationLookupResult = {
  locationIdx: number;
  locationId: number;
};

export type LocationHoverChangeEvent =
  | {
      kind: "update";
      locationIdx: number;
    }
  | { kind: "clear" };

export type LocationClickChangeEvent =
  | { kind: "update"; locationIdx: number; modifiers: number }
  | { kind: "clear" };

export type CursorHint = "default" | "move" | "crosshair";

interface OverlayCanvasInfo {
  canvas: OffscreenCanvas;
  x: number;
  y: number;
}

function createOverlayCanvas(
  overlayData: ScreenshotOverlayData,
  fullResolution: boolean,
  compositeHeight: number,
): OverlayCanvasInfo {
  const multiplier = fullResolution ? 2 : 1;
  const baseFontSize = Math.trunc(compositeHeight / 100);
  const padding = 24 * multiplier;
  const headerSpacing = 64 * multiplier;

  // Create a temporary canvas just for measuring text
  const tempCanvas = new OffscreenCanvas(1, 1);
  const tempCtxRaw = tempCanvas.getContext("2d");
  if (!tempCtxRaw) {
    throw new Error("Failed to create temporary canvas context");
  }
  const tempCtx = tempCtxRaw;

  // Fonts
  const headerFont = `700 ${baseFontSize}px ui-sans-serif, system-ui, sans-serif`;
  const bodyFont = `400 ${Math.trunc(baseFontSize * 0.8)}px ui-sans-serif, system-ui, sans-serif`;
  const bodyLineHeight = Math.trunc(baseFontSize * 0.9);

  // Helper function to convert TableCell to display string
  function cellToString(cell: TableCell): string {
    if (cell.type === "text") {
      return cell.value;
    } else if (cell.type === "integer") {
      return formatInt(cell.value);
    } else if (cell.type === "float") {
      return cell.value.value.toFixed(cell.value.decimals);
    }
    return "";
  }

  // Header measurements
  tempCtx.font = headerFont;
  const titleMetrics = tempCtx.measureText(overlayData.title);
  const dateAndPatchText = `${overlayData.saveDate} (${overlayData.patchVersion})`;
  const dateAndPatchMetrics = tempCtx.measureText(dateAndPatchText);
  const headerHeight = titleMetrics.actualBoundingBoxAscent + titleMetrics.actualBoundingBoxDescent;
  const maxHeaderWidth = titleMetrics.width + headerSpacing + dateAndPatchMetrics.width;

  // Table data
  tempCtx.font = bodyFont;
  const { leftTable, rightTable } = overlayData.body;
  const maxRows = overlayData.body.maxRows || 10;
  const leftRows = leftTable.rows.slice(0, maxRows);
  const rightRows = rightTable.rows.slice(0, maxRows);
  const columnSpacing = 40 * multiplier;
  const tableGap = 80 * multiplier;

  // Helper function to calculate column widths
  function calculateColumnWidths(table: any, rows: TableCell[][]): number[] {
    return table.headers.map((header: string, colIndex: number) => {
      let maxWidth = tempCtx.measureText(header).width;
      rows.forEach((row) => {
        const cell = row[colIndex];
        const cellData = cell ? cellToString(cell) : "";
        const cellWidth = tempCtx.measureText(cellData).width;
        maxWidth = Math.max(maxWidth, cellWidth);
      });
      return maxWidth;
    });
  }

  // Calculate table dimensions
  const leftColumnWidths = calculateColumnWidths(leftTable, leftRows);
  const rightColumnWidths = calculateColumnWidths(rightTable, rightRows);

  const leftTableWidth =
    leftColumnWidths.reduce((sum, width) => sum + width, 0) +
    (leftColumnWidths.length - 1) * columnSpacing;
  const rightTableWidth =
    rightColumnWidths.reduce((sum, width) => sum + width, 0) +
    (rightColumnWidths.length - 1) * columnSpacing;

  // Adjust for table titles
  const adjustedLeftTableWidth = leftTable.title
    ? Math.max(leftTableWidth, tempCtx.measureText(leftTable.title).width)
    : leftTableWidth;
  const adjustedRightTableWidth = rightTable.title
    ? Math.max(rightTableWidth, tempCtx.measureText(rightTable.title).width)
    : rightTableWidth;

  const totalTableWidth = adjustedLeftTableWidth + tableGap + adjustedRightTableWidth;

  // Layout calculations
  const titleRowHeight = leftTable.title || rightTable.title ? bodyLineHeight : 0;
  const totalBodyHeight = titleRowHeight + bodyLineHeight + leftRows.length * bodyLineHeight;
  const backdropWidth = Math.max(maxHeaderWidth, totalTableWidth) + padding * 2;
  const backdropHeight = headerHeight + totalBodyHeight + padding * 4;

  // Create overlay canvas sized exactly to fit the infographic
  const overlayCanvas = new OffscreenCanvas(Math.ceil(backdropWidth), Math.ceil(backdropHeight));
  const ctxRaw = overlayCanvas.getContext("2d");
  if (!ctxRaw) {
    throw new Error("Failed to create overlay canvas context");
  }
  const ctx = ctxRaw;

  // Draw backdrop
  ctx.fillStyle = "#20272c";
  ctx.beginPath();
  ctx.roundRect(0, 0, backdropWidth, backdropHeight, 20 * multiplier);
  ctx.fill();

  // Draw content
  ctx.fillStyle = "#ffffff";
  let currentY = padding;

  // Header
  ctx.font = headerFont;
  currentY += headerHeight;
  ctx.fillText(overlayData.title, padding, currentY);
  const rightAlignX = backdropWidth - padding - dateAndPatchMetrics.width;
  ctx.fillText(dateAndPatchText, rightAlignX, currentY);

  // Tables
  ctx.font = bodyFont;
  currentY += padding;

  const leftTableX = padding;
  const rightTableX = leftTableX + adjustedLeftTableWidth + tableGap;

  // Helper function to render a table
  function renderTable(table: any, rows: TableCell[][], columnWidths: number[], startX: number) {
    let y = currentY;

    // Table title
    if (table.title) {
      y += bodyLineHeight;
      ctx.fillText(table.title, startX, y);
    }

    // Headers
    y += bodyLineHeight;
    let x = startX;
    table.headers.forEach((header: string, colIndex: number) => {
      ctx.fillText(header, x, y);
      x += columnWidths[colIndex] + columnSpacing;
    });

    // Data rows
    rows.forEach((row: TableCell[]) => {
      y += bodyLineHeight;
      x = startX;
      row.forEach((cell: TableCell, colIndex: number) => {
        const cellData = cellToString(cell);
        // Right-align numeric columns (except first column)
        if (colIndex > 0 && (cell.type === "integer" || cell.type === "float")) {
          const textWidth = ctx.measureText(cellData).width;
          ctx.fillText(cellData, x + columnWidths[colIndex] - textWidth, y);
        } else {
          ctx.fillText(cellData, x, y);
        }
        x += columnWidths[colIndex] + columnSpacing;
      });
    });
  }

  // Render both tables
  renderTable(leftTable, leftRows, leftColumnWidths, leftTableX);
  renderTable(rightTable, rightRows, rightColumnWidths, rightTableX);

  // Calculate position where overlay should be placed on composite canvas
  const overlayX = 100 * multiplier;
  const overlayY = compositeHeight - backdropHeight - 100 * multiplier;

  return {
    canvas: overlayCanvas,
    x: overlayX,
    y: overlayY,
  };
}

export async function initialize(port: MessagePort, level: LogLevel) {
  const endpoint = mapGameEndpoint();
  expose(endpoint, port);

  await initialized;
  timeSync("Setup EU5 Map Wasm", () => setup_eu5_map_wasm(level));
}
