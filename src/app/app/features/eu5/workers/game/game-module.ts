import { fetchOk } from "@/lib/fetch";
import type { Eu5MapHoverTarget } from "../../useEu5MapHoverTarget";
import type { Eu5MapEndpoint } from "../map/map-module";
import type { Eu5SaveInput } from "../../store/types";
import { timeAsync, timeSync } from "@/lib/timeit";
import init, * as wasm_eu5 from "../../../../wasm/wasm_eu5";
import type {
  MapMode,
  DisplayData,
  GradientConfig,
  GradientPalette,
  StateEfficacyInsightData,
  SelectionSummaryData,
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
} from "../../../../wasm/wasm_eu5";
import wasmPath from "../../../../wasm/wasm_eu5_bg.wasm?url";
import tokenPath from "../../../../../../../assets/tokens/eu5.bin?url";
import { proxy, transfer, wrap } from "comlink";
import { SharedCanvasModifierBits } from "@/lib/canvas_courier";

const tokensTask = fetchOk(tokenPath).then((x) => x.arrayBuffer());

const paletteToCss = (palette: GradientPalette): string => {
  const stops = wasm_eu5
    .palette_stops(palette)
    .map((s) => `${s.color} ${(s.offset * 100).toFixed(2)}%`)
    .join(", ");
  return `linear-gradient(to right, ${stops})`;
};
const initialized = (async () => {
  const result = await timeAsync("Load EU5 Wasm module", () => init({ module_or_path: wasmPath }));

  return { memory: result.memory };
})();

export const createGame = async (
  {
    save,
  }: {
    save: Eu5SaveInput;
  },
  {
    gameBundle,
    onProgress,
  }: {
    gameBundle: {
      selectVersion: (version: string) => void;
      fetch: () => Promise<Uint8Array>;
      fetchLocalization: () => Promise<Uint8Array>;
    };
    onProgress?: (increment: number) => void;
  },
) => {
  const readFile = async () => {
    const file = save.kind === "handle" ? await save.file.getFile() : save.file;
    return await file.arrayBuffer();
  };

  const saveDataTask = timeAsync("Read Save File", () => readFile());

  const [wasm, tokens] = await Promise.all([initialized, tokensTask]);
  timeSync("Set EU5 Tokens", () => wasm_eu5.set_tokens(new Uint8Array(tokens)));
  onProgress?.(5); // Initialize wasm/tokens

  const metaParser = timeSync("Create Meta Parser", () => wasm_eu5.Eu5MetaParser.create());

  const saveData = await saveDataTask;
  onProgress?.(10); // Read save file

  const saveParser = timeSync("Initialize Save Parser", () =>
    metaParser.init(new Uint8Array(saveData)),
  );

  const metadata = saveParser.meta();
  const version = `${metadata.version.major}.${metadata.version.minor}`;
  gameBundle.selectVersion(version);
  const gameDataTask = gameBundle.fetch();
  const localizationTask = gameBundle
    .fetchLocalization()
    .then((data) =>
      timeSync("Create localization bundle", () => wasm_eu5.Eu5WasmLocalizationBundle.open(data)),
    );

  const gamestate = await (async () => {
    try {
      return timeSync("Parse Gamestate", () => saveParser.parse_gamestate());
    } catch (originalError) {
      const { diagnoseEu5Save } = await import("./eu5-diagnostics");
      await diagnoseEu5Save(saveData, tokens);
      throw originalError;
    }
  })();
  onProgress?.(30); // Parse gamestate

  const gameBundleData = await gameDataTask;
  const gameBundleWasm = timeSync("Create game bundle", () =>
    wasm_eu5.Eu5WasmGameBundle.open(gameBundleData),
  );
  onProgress?.(5); // Create game bundle

  // Build the workspace first so the map worker can begin syncing
  // GPU buffers in parallel with the localization fetch.
  const workspace = timeSync("Initialize workspace", () =>
    wasm_eu5.Eu5WasmWorkspace.init(gamestate, gameBundleWasm),
  );
  onProgress?.(3); // Initialize workspace

  if (!mapEndpoint) {
    throw new Error("Map endpoint not initialized");
  }
  const map = mapEndpoint;

  const startingLocation = workspace.get_starting_coordinates();
  if (startingLocation) {
    map.center_at_color_id(startingLocation.color_id);
  }

  const syncInitialLocationData = () => {
    const buffer = workspace.location_arrays();
    const locationArray = new Uint32Array(wasm.memory.buffer, buffer.ptr(), buffer.len());

    // Making a clone in the web worker instead of having the channel do a
    // structured clone is 100x faster on firefox. Decreased latency from 600ms
    // to 6ms.
    const cloned = new Uint32Array(locationArray);
    return map.syncLocationData(transfer(cloned, [cloned.buffer]));
  };

  const syncInitialGroupingTable = () => {
    const raw = workspace.grouping_table();
    return map.syncGroupingTable(transfer(raw, [raw.buffer]));
  };

  await syncInitialLocationData();
  syncInitialGroupingTable();
  onProgress?.(5); // Sync location data

  const localizationBundle = await localizationTask;
  onProgress?.(2); // Create localization bundle

  const app = timeSync("Localize app", () => workspace.localize(localizationBundle));

  // Build search indexes once after initialization.
  const countryIndex = timeSync("Build country index", () => app.get_countries().countries);
  const locationIndex = timeSync("Build location index", () => app.get_locations().locations);

  // Render each palette into a CSS gradient string once. The palette stops
  // come from Rust (single source of truth with the shader); the FE only ever
  // sees opaque CSS strings keyed by palette tag.
  const paletteGradients: Record<GradientPalette, string> = {
    eu5: paletteToCss("eu5"),
  };

  const syncLocationData = () => {
    const buffer = app.location_arrays();
    const locationArray = new Uint32Array(wasm.memory.buffer, buffer.ptr(), buffer.len());

    // Making a clone in the web worker instead of having the channel do a
    // structured clone is 100x faster on firefox. Decreased latency from 600ms
    // to 6ms.
    const cloned = new Uint32Array(locationArray);
    return map.syncLocationData(transfer(cloned, [cloned.buffer]));
  };

  const syncGroupingTable = () => {
    const raw = app.grouping_table();
    return map.syncGroupingTable(transfer(raw, [raw.buffer]));
  };

  const syncAll = () => {
    const p = syncLocationData();
    syncGroupingTable();
    return p;
  };

  // Push selection state and the gradient produced by the most recent mutation
  // back to the UI. `gradient` is undefined when the mode produces no gradient
  // (e.g. political, markets, religion).
  const pushSelection = (gradient?: GradientConfig) => {
    selectionCallback?.(app.get_selection_summary(), gradient);
  };

  // Run a selection mutation, sync GPU buffers, and push the new state.
  const afterMutation = (gradient?: GradientConfig) => {
    const p = syncLocationData();
    pushSelection(gradient);
    return p;
  };

  map.onLocationHoverUpdate(
    proxy((event) => {
      app.clear_highlights();

      if (event.kind === "update") {
        app.handle_location_hover(event.locationIdx);
        hoverDisplayCallback?.(app.get_hover_data(event.locationIdx));
      } else if (event.kind === "clear") {
        hoverDisplayCallback?.({ kind: "clear" });
      }

      syncLocationData();
    }),
  );

  map.onLocationClickUpdate(
    proxy((event) => {
      let gradient: GradientConfig | undefined;
      if (event.kind === "update") {
        const mods = event.modifiers;
        if (mods & SharedCanvasModifierBits.Shift) {
          gradient = app.add_entity(event.locationIdx);
        } else if (mods & SharedCanvasModifierBits.Alt) {
          gradient = app.remove_entity(event.locationIdx);
        } else {
          gradient = app.select_entity(event.locationIdx);
        }
      } else {
        gradient = app.clear_focus_or_selection();
      }
      syncLocationData();
      pushSelection(gradient);
    }),
  );

  map.onBoxSelectCommit(
    proxy((event) => {
      let gradient: GradientConfig | undefined;
      switch (event.operation) {
        case "add":
          gradient = app.apply_resolved_box_selection(event.locationIdxs, true);
          break;
        case "remove":
          gradient = app.apply_resolved_box_selection(event.locationIdxs, false);
          break;
        case "replace":
          gradient = app.replace_selection_with_locations(event.locationIdxs);
          break;
      }
      const p = syncLocationData();
      pushSelection(gradient);
      return p;
    }),
  );

  return proxy({
    setMapMode: async (mode: MapMode): Promise<void> => {
      const gradient = app.set_map_mode(mode);
      await syncAll();
      pushSelection(gradient);
    },
    getMapMode: () => {
      return app.get_map_mode();
    },
    getPaletteGradients: () => paletteGradients,
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
      const locationArray = new Uint32Array(wasm.memory.buffer, buffer.ptr(), buffer.len());
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
        () => wasm_eu5.melt(new Uint8Array(saveData)) as Uint8Array<ArrayBuffer>,
      );
    },
    onHoverDisplayUpdate: (callback: (data: DisplayData) => void) => {
      hoverDisplayCallback = callback;
    },
    onSelectionUpdate: (
      callback: (data: SelectionSummaryData, gradient?: GradientConfig) => void,
    ) => {
      selectionCallback = callback;
    },
    selectCountry: (countryIdx: number) => afterMutation(app.select_country(countryIdx).gradient),
    addCountry: (countryIdx: number) => afterMutation(app.add_country(countryIdx)),
    removeCountry: (countryIdx: number) => afterMutation(app.remove_country(countryIdx)),
    selectMarket: (marketId: number) => afterMutation(app.select_market(marketId).gradient),
    addMarket: (marketId: number) => afterMutation(app.add_market(marketId)),
    removeMarket: (marketId: number) => afterMutation(app.remove_market(marketId)),
    setFocusedLocation: (locationIdx: number) =>
      afterMutation(app.set_focused_location(locationIdx).gradient),
    clearFocus: () => afterMutation(app.clear_focus()),
    clearFocusOrSelection: () => afterMutation(app.clear_focus_or_selection()),
    selectPlayers: () => afterMutation(app.select_players()),
    clearSelection: () => afterMutation(app.clear_selection()),
    highlightMapHoverTarget: (target: Eu5MapHoverTarget) => {
      app.clear_highlights();
      switch (target.kind) {
        case "location":
          app.highlight_location(target.locationIdx);
          break;
        case "country":
          app.highlight_country(target.countryIdx);
          break;
        case "market":
          app.highlight_market(target.marketId);
          break;
      }
      return syncLocationData();
    },
    clearMapHoverHighlight: () => {
      app.clear_highlights();
      return syncLocationData();
    },
    getStateEfficacy: (): StateEfficacyInsightData => {
      return app.get_state_efficacy();
    },

    getCountryProfile: (countryIdx: number): CountryProfile | null => {
      return timeSync("Get country profile", () => app.get_country_profile(countryIdx) ?? null);
    },
    getCountryPopulationProfile: (countryIdx: number): CountryPopulationProfile | null => {
      return app.get_country_population_profile(countryIdx) ?? null;
    },
    getMarketProfile: (marketId: number): MarketProfile | null => {
      return app.get_market_profile(marketId) ?? null;
    },
    getMarketGoodsProfile: (marketId: number): ScopedGoodSummary[] => {
      return app.get_market_goods_profile(marketId);
    },
    getMarketLocationsProfile: (marketId: number): MarketProductionLocationSummary[] => {
      return app.get_market_locations_profile(marketId);
    },
    getLocationProfile: (locationIdx: number): LocationProfile | null => {
      return app.get_location_profile(locationIdx) ?? null;
    },

    getDevelopmentInsight: (): DevelopmentInsightData => {
      return app.get_development_insight();
    },
    getWealthInsight: (): WealthInsightData => {
      return app.get_wealth_insight();
    },
    getWealthScope: (): WealthScope => {
      return app.get_wealth_scope();
    },
    getUnrealizedTaxBaseInsight: (): UnrealizedTaxBaseInsightData => {
      return app.get_unrealized_tax_base_insight();
    },
    getUnrealizedTaxBaseScope: (): UnrealizedTaxBaseScope => {
      return app.get_unrealized_tax_base_scope();
    },
    getMarketInsight: (): MarketInsightData => {
      return app.get_market_insight();
    },
    getPopulationInsight: (): PopulationInsightData => {
      return app.get_population_insight();
    },
    getBuildingLevelsInsight: (): BuildingLevelsInsightData => {
      return app.get_building_levels_insight();
    },
    getReligionInsight: (): ReligionInsightData => {
      return app.get_religion_insight();
    },
    getRgoInsight: (): RgoInsightData => {
      return app.get_rgo_insight();
    },
    getControlInsight: (): ControlInsightData => {
      return app.get_control_insight();
    },
    getPoliticalWorldScoreboard: (): PoliticalWorldScoreboard => {
      return app.get_political_world_scoreboard();
    },

    searchEntities: (query: string) => {
      const lower = query.toLowerCase();
      const countries = countryIndex
        .filter(
          (c) =>
            c.capital !== null &&
            c.capital !== undefined &&
            (c.country.name.toLowerCase().includes(lower) || c.tag.toLowerCase().includes(lower)),
        )
        .map((c) => ({
          kind: "country" as const,
          id: c.country.key,
          name: c.country.name,
          tag: c.tag,
          locationIdx: c.capital!,
        }));

      const locations = locationIndex
        .filter((entry) => entry.location.name.toLowerCase().includes(lower))
        .map((entry) => ({
          kind: "location" as const,
          id: entry.location.key,
          name: entry.location.name,
          locationIdx: entry.location.key,
        }));

      return [...countries, ...locations].slice(0, 20);
    },

    getLocationColorId: (locationIdx: number): number | null => {
      return app.center_at(locationIdx) ?? null;
    },

    getPoliticalDefaultCountryAnchor: (): number | null => {
      return app.political_default_country_anchor() ?? null;
    },
  });
};

let mapEndpoint: Eu5MapEndpoint | null = null;
let hoverDisplayCallback: ((data: DisplayData) => void) | null = null;
let selectionCallback: ((data: SelectionSummaryData, gradient?: GradientConfig) => void) | null =
  null;

export async function initialize(port: MessagePort, level: wasm_eu5.LogLevel) {
  mapEndpoint = wrap<Eu5MapEndpoint>(port);
  await initialized;
  timeSync("Setup EU5 Wasm", () => wasm_eu5.setup_eu5_wasm(level));
}
