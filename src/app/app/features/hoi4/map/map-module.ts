import init, {
  Hoi4CanvasSurface,
  Hoi4MapRenderer,
  Hoi4MapTextures,
  setup_hoi4_map_wasm,
} from "../../../wasm/wasm_hoi4_map";
import type { LogLevel } from "../../../wasm/wasm_hoi4_map";
import wasmPath from "../../../wasm/wasm_hoi4_map_bg.wasm?url";
import { fetchOk } from "@/lib/fetch";
import { timeAsync, timeSync } from "@/lib/timeit";
import {
  SharedCanvasInputReader,
  SharedCanvasEventType,
  SharedCanvasEventAction,
  WebKeyCode,
} from "@/lib/canvas_courier";
import type { SharedCanvasInputConfig, SharedCanvasDecodedEvent } from "@/lib/canvas_courier";

const webKeyCodeToString = Object.fromEntries(
  Object.entries(WebKeyCode).map(([name, value]) => [value as number, name]),
) as Record<number, string>;

/** A pointer that moves less than this many pixels between press and release is a click. */
const CLICK_DISTANCE = 5;

export type Hoi4MapCallbacks = {
  /** The province under the cursor changed. Zero when the cursor is off the map. */
  onHover: (provinceId: number) => void;
  /** The player clicked a province. Zero when the click was not on a province. */
  onClick: (provinceId: number) => void;
};

export type Hoi4MapInit = {
  canvas: OffscreenCanvas;
  display: { width: number; height: number; scaleFactor: number };
  inputConfig: SharedCanvasInputConfig;
  mapUrl: string;
  logLevel: LogLevel;
};

/**
 * Create the map renderer on the canvas and start the render loop.
 *
 * Rejects when the browser cannot render the map (eg: no WebGPU adapter),
 * so that the caller can continue without the map.
 */
export async function createMap(
  { canvas, display, inputConfig, mapUrl, logLevel }: Hoi4MapInit,
  callbacks: Hoi4MapCallbacks,
) {
  const [, mapData] = await Promise.all([
    timeAsync("Load HOI4 map wasm module", async () => {
      await init({ module_or_path: wasmPath });
      setup_hoi4_map_wasm(logLevel);
    }),
    timeAsync("Fetch HOI4 map bundle", async () => {
      const response = await fetchOk(mapUrl);
      return new Uint8Array(await response.arrayBuffer());
    }),
  ]);

  const surface = await timeAsync("HOI4 canvas initialization", () =>
    Hoi4CanvasSurface.init(canvas, display),
  );
  const textures = timeSync("Decode HOI4 map textures", () => Hoi4MapTextures.open(mapData));
  const app = timeSync("Create HOI4 renderer", () => Hoi4MapRenderer.create(surface, textures));
  startRenderLoop(app, display, inputConfig, callbacks);
}

let pendingLocations: Uint32Array | null = null;
let pendingFlags: Uint32Array | null = null;
let pendingCenter: number | null = null;

/** Replace the colors and flags of all provinces */
export function syncLocations(data: Uint32Array) {
  pendingLocations = data;
  pendingFlags = null;
}

/** Replace the flags of all provinces (eg: to highlight a country) */
export function syncFlags(data: Uint32Array) {
  pendingFlags = data;
}

/** Center the view on a province after the next location sync */
export function centerOnProvince(provinceId: number) {
  pendingCenter = provinceId;
}

function startRenderLoop(
  app: Hoi4MapRenderer,
  display: Hoi4MapInit["display"],
  inputConfig: SharedCanvasInputConfig,
  callbacks: Hoi4MapCallbacks,
) {
  const inputReader = new SharedCanvasInputReader(inputConfig);
  let dimensions = { ...display };
  let newDimensions: typeof dimensions | null = null;
  let hasLocations = false;
  let hoveredProvince = 0;
  let cursorOnMap = false;
  let pointerDown: { x: number; y: number } | null = null;
  const pressedKeys = new Set<string>();

  const updateHover = () => {
    const provinceId = cursorOnMap && hasLocations ? app.province_under_cursor() : 0;
    if (provinceId !== hoveredProvince) {
      hoveredProvince = provinceId;
      callbacks.onHover(provinceId);
    }
  };

  const releaseKeys = () => {
    for (const code of pressedKeys) {
      app.on_key_up(code);
    }
    pressedKeys.clear();
  };

  const processInputEvent = (event: SharedCanvasDecodedEvent) => {
    switch (event.type) {
      case SharedCanvasEventType.Pointer: {
        const { action, x, y, button } = event;
        const btn = button >= 0 ? button : 0;
        if (action === SharedCanvasEventAction.Move) {
          cursorOnMap = true;
          app.on_cursor_move(x, y);
          if (pointerDown === null) {
            updateHover();
          }
        } else if (action === SharedCanvasEventAction.Down) {
          cursorOnMap = true;
          app.on_cursor_move(x, y);
          if (btn === 0) {
            pointerDown = { x, y };
          }
          app.on_mouse_button(btn, true);
        } else if (action === SharedCanvasEventAction.Up) {
          if (btn === 0 && pointerDown !== null) {
            const distance = Math.hypot(x - pointerDown.x, y - pointerDown.y);
            if (distance < CLICK_DISTANCE) {
              callbacks.onClick(hasLocations ? app.province_under_cursor() : 0);
            }
            pointerDown = null;
          }
          app.on_mouse_button(btn, false);
          updateHover();
        } else if (action === SharedCanvasEventAction.Leave) {
          app.on_mouse_button(0, false);
          pointerDown = null;
          cursorOnMap = false;
          updateHover();
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
        break;
      }
      case SharedCanvasEventType.Wheel: {
        app.on_scroll(event.deltaY < 0 ? 1 : -1);
        updateHover();
        break;
      }
      case SharedCanvasEventType.Resize: {
        newDimensions = {
          width: event.width,
          height: event.height,
          scaleFactor: event.scaleFactor,
        };
        break;
      }
      case SharedCanvasEventType.FocusChange:
      case SharedCanvasEventType.Visibility: {
        // The canvas gets no key up for a key that is released after the
        // canvas loses focus. Release all keys so that the map stops panning.
        if (
          event.action === SharedCanvasEventAction.Blur ||
          event.action === SharedCanvasEventAction.Hidden
        ) {
          releaseKeys();
        }
        break;
      }
      default:
        break;
    }
  };

  const applyPendingSync = () => {
    if (pendingLocations !== null) {
      app.sync_location_array(pendingLocations);
      pendingLocations = null;
      hasLocations = true;
    }
    if (pendingFlags !== null && hasLocations) {
      app.sync_flag_array(pendingFlags);
      pendingFlags = null;
    }
    if (pendingCenter !== null && hasLocations) {
      app.center_on_province(pendingCenter);
      pendingCenter = null;
    }
  };

  const frame = async () => {
    try {
      applyPendingSync();
      inputReader.drain(processInputEvent);

      if (newDimensions !== null) {
        const diff =
          Math.abs(newDimensions.width - dimensions.width) +
          Math.abs(newDimensions.height - dimensions.height) +
          Math.abs(newDimensions.scaleFactor - dimensions.scaleFactor);
        if (diff >= 4) {
          dimensions = newDimensions;
          await app.queued_work().wait();
          app.resize(dimensions.width, dimensions.height, dimensions.scaleFactor);
        }
        newDimensions = null;
      }

      app.tick();
      if (pressedKeys.size > 0) {
        updateHover();
      }

      if (hasLocations) {
        app.render();
      }
    } catch (error) {
      console.error("HOI4 map frame failed", error);
    }
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
