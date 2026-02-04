import { fetchOk } from "@/lib/fetch";
import type { Eu5MapEndpoint } from "../map/map-module";
import type { Eu5SaveInput } from "../../store/useLoadEu5";
import { timeAsync, timeSync } from "@/lib/timeit";
import init, * as wasm_eu5 from "../../../../wasm/wasm_eu5";
import type {
  MapMode,
  HoverDisplayData,
  MapModeRange,
  StateEfficacyData,
} from "../../../../wasm/wasm_eu5";
import wasmPath from "../../../../wasm/wasm_eu5_bg.wasm?url";
import tokenPath from "../../../../../../../assets/tokens/eu5.bin?url";
import { proxy, transfer, wrap } from "comlink";

const tokensTask = fetchOk(tokenPath).then((x) => x.arrayBuffer());
const initialized = (async () => {
  const result = await timeAsync("Load EU5 Wasm module", () =>
    init({ module_or_path: wasmPath }),
  );

  return { memory: result.memory };
})();

export const createGame = async (
  {
    save,
  }: {
    save: Eu5SaveInput;
  },
  {
    bundleFetch,
    onProgress,
  }: {
    bundleFetch: () => Promise<Uint8Array>;
    onProgress?: (increment: number) => void;
  },
) => {
  const readFile = async () => {
    const file = save.kind === "handle" ? await save.file.getFile() : save.file;
    return await file.arrayBuffer();
  };

  const saveDataTask = timeAsync("Read Save File", () => readFile());

  const wasm = await initialized;
  onProgress?.(5); // Initialize wasm/tokens

  const metaParser = timeSync("Create Meta Parser", () =>
    wasm_eu5.Eu5MetaParser.create(),
  );

  const saveData = await saveDataTask;
  onProgress?.(10); // Read save file

  const saveParser = timeSync("Initialize Save Parser", () =>
    metaParser.init(new Uint8Array(saveData)),
  );

  const metadata = saveParser.meta();
  const gameDataTask = bundleFetch();

  const gamestate = timeSync("Parse Gamestate", () =>
    saveParser.parse_gamestate(),
  );
  onProgress?.(30); // Parse gamestate

  const gameBundleData = await gameDataTask;
  const gameBundle = timeSync("Create game bundle", () =>
    wasm_eu5.Eu5WasmGameBundle.open(gameBundleData),
  );
  onProgress?.(5); // Create game bundle

  const app = timeSync("Initialize App", () =>
    wasm_eu5.Eu5App.init(gamestate, gameBundle),
  );
  onProgress?.(5); // Initialize app

  if (!mapEndpoint) {
    throw new Error("Map endpoint not initialized");
  }

  const startingCoordinates = app.get_starting_coordinates();
  if (startingCoordinates) {
    mapEndpoint.center_at(startingCoordinates.x, startingCoordinates.y);
  }

  const syncLocationData = () => {
    const buffer = app.location_arrays();
    const locationArray = new Uint32Array(
      wasm.memory.buffer,
      buffer.ptr(),
      buffer.len(),
    );

    // Making a clone in the web worker instead of having the channel do a
    // structured clone is 100x faster on firefox. Decreased latency from 600ms
    // to 6ms.
    const cloned = new Uint32Array(locationArray);
    return mapEndpoint?.syncLocationData(transfer(cloned, [cloned.buffer]));
  };

  await syncLocationData();
  onProgress?.(5); // Sync location data

  mapEndpoint.onLocationHoverUpdate(
    proxy((event) => {
      app.clear_highlights();

      if (event.kind === "update" && currentZoom !== null) {
        const zoom = currentZoom;
        app.handle_location_hover(event.locationIdx, zoom);
        hoverDisplayCallback?.(app.get_hover_data(event.locationIdx, zoom));
      } else if (event.kind === "clear") {
        hoverDisplayCallback?.({ kind: "clear" });
      }

      syncLocationData();
    }),
  );

  return proxy({
    setMapMode: (mode: MapMode) => {
      app.set_map_mode(mode);
      return syncLocationData();
    },
    getMapMode: () => {
      return app.get_map_mode();
    },
    getDate: () => {
      return app.get_date();
    },
    getSaveMetadata: () => {
      return metadata;
    },
    canHighlightLocation: (locationId: number) => {
      return app.can_highlight_location(locationId);
    },
    getOverlayData: () => {
      return app.get_overlay_data();
    },
    getLocationArrays: (): Blob => {
      const buffer = app.location_arrays();
      const locationArray = new Uint32Array(
        wasm.memory.buffer,
        buffer.ptr(),
        buffer.len(),
      );
      // Create a copy of the data since the original is tied to WASM memory
      const dataArray = new Uint32Array(locationArray);
      return new Blob([dataArray.buffer], { type: "application/octet-stream" });
    },
    melt: async (): Promise<Uint8Array<ArrayBuffer>> => {
      // We re-read the save file so that we don't have to keep a potentially
      // large, uncompressed file in memory.
      const saveData = await timeAsync("Read Save File", () => readFile());
      return timeSync(
        "Melt save file",
        () =>
          wasm_eu5.melt(new Uint8Array(saveData)) as Uint8Array<ArrayBuffer>,
      );
    },
    onHoverDisplayUpdate: (callback: (data: HoverDisplayData) => void) => {
      hoverDisplayCallback = callback;
    },
    getMapModeRange: (mode: MapMode): MapModeRange => {
      return app.get_map_mode_range(mode);
    },
    getStateEfficacy: (): StateEfficacyData => {
      return app.get_state_efficacy();
    },
  });
};

let mapEndpoint: Eu5MapEndpoint | null = null;
let currentZoom: number | null = null; // Will be set by initial callback from map worker
let hoverDisplayCallback: ((data: HoverDisplayData) => void) | null = null;

export async function initialize(port: MessagePort, level: wasm_eu5.LogLevel) {
  mapEndpoint = wrap<Eu5MapEndpoint>(port);

  // Set up zoom change callback
  mapEndpoint.onZoomChange(
    proxy((rawZoom: number) => {
      currentZoom = rawZoom;
    }),
  );

  await initialized;
  timeSync("Setup EU5 Wasm", () => wasm_eu5.setup_eu5_wasm(level));
  const tokens = await tokensTask;
  timeSync("Set EU5 Tokens", () => wasm_eu5.set_tokens(new Uint8Array(tokens)));
}
