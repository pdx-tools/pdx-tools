import { fetchOk } from "@/lib/fetch";
import type { Eu5MapEndpoint } from "../map/map-module";
import type { Eu5SaveInput } from "../../store/types";
import { timeAsync, timeSync } from "@/lib/timeit";
import init, * as wasm_eu5 from "../../../../wasm/wasm_eu5";
import type {
  MapMode,
  HoverDisplayData,
  MapModeRange,
  StateEfficacyData,
  SelectionSummaryData,
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
  ScopeSummary,
} from "../../../../wasm/wasm_eu5";
import wasmPath from "../../../../wasm/wasm_eu5_bg.wasm?url";
import tokenPath from "../../../../../../../assets/tokens/eu5.bin?url";
import { proxy, transfer, wrap } from "comlink";
import { SharedCanvasModifierBits } from "@/lib/canvas_courier";

const tokensTask = fetchOk(tokenPath).then((x) => x.arrayBuffer());
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
    bundle,
    onProgress,
  }: {
    bundle: {
      setVersion: (version: string) => void;
      fetch: () => Promise<Uint8Array>;
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
  bundle.setVersion(version);
  const gameDataTask = bundle.fetch();

  const gamestate = timeSync("Parse Gamestate", () => saveParser.parse_gamestate());
  onProgress?.(30); // Parse gamestate

  const gameBundleData = await gameDataTask;
  const gameBundle = timeSync("Create game bundle", () =>
    wasm_eu5.Eu5WasmGameBundle.open(gameBundleData),
  );
  onProgress?.(5); // Create game bundle

  const app = timeSync("Initialize App", () => wasm_eu5.Eu5App.init(gamestate, gameBundle));
  onProgress?.(5); // Initialize app

  // Build the country search index once after initialization
  const countryIndex = timeSync("Build country index", () => app.get_countries().countries);

  if (!mapEndpoint) {
    throw new Error("Map endpoint not initialized");
  }

  const startingLocation = app.get_starting_coordinates();
  if (startingLocation) {
    mapEndpoint.center_at_color_id(startingLocation.color_id);
  }

  const syncLocationData = () => {
    const buffer = app.location_arrays();
    const locationArray = new Uint32Array(wasm.memory.buffer, buffer.ptr(), buffer.len());

    // Making a clone in the web worker instead of having the channel do a
    // structured clone is 100x faster on firefox. Decreased latency from 600ms
    // to 6ms.
    const cloned = new Uint32Array(locationArray);
    return mapEndpoint?.syncLocationData(transfer(cloned, [cloned.buffer]));
  };

  const syncGroupingTable = () => {
    const raw = app.grouping_table();
    return mapEndpoint?.syncGroupingTable(transfer(raw, [raw.buffer]));
  };

  const syncAll = () => {
    const p = syncLocationData();
    syncGroupingTable();
    return p;
  };

  await syncLocationData();
  syncGroupingTable();
  onProgress?.(5); // Sync location data

  mapEndpoint.onLocationHoverUpdate(
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

  mapEndpoint.onLocationClickUpdate(
    proxy((event) => {
      if (event.kind === "update") {
        const mods = event.modifiers;
        if (mods & SharedCanvasModifierBits.Shift) {
          app.add_entity(event.locationIdx);
        } else if (mods & SharedCanvasModifierBits.Alt) {
          app.remove_entity(event.locationIdx);
        } else {
          app.select_entity(event.locationIdx);
        }
      } else {
        app.clear_focus_or_selection();
      }
      syncLocationData();
      selectionCallback?.(app.get_selection_summary());
    }),
  );

  mapEndpoint.onBoxSelectCommit(
    proxy((event) => {
      switch (event.operation) {
        case "add":
          app.apply_resolved_box_selection(event.locationIdxs, true);
          break;
        case "remove":
          app.apply_resolved_box_selection(event.locationIdxs, false);
          break;
        case "replace":
          app.replace_selection_with_locations(event.locationIdxs);
          break;
      }
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    }),
  );

  return proxy({
    setMapMode: (mode: MapMode) => {
      app.set_map_mode(mode);
      const p = syncAll();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    getMapMode: () => {
      return app.get_map_mode();
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
    onHoverDisplayUpdate: (callback: (data: HoverDisplayData) => void) => {
      hoverDisplayCallback = callback;
    },
    onSelectionUpdate: (callback: (data: SelectionSummaryData) => void) => {
      selectionCallback = callback;
    },
    selectEntity: (locationIdx: number) => {
      app.select_entity(locationIdx);
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    selectCountry: (locationIdx: number) => {
      app.select_country(locationIdx);
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    addCountry: (locationIdx: number) => {
      app.add_country(locationIdx);
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    removeCountry: (locationIdx: number) => {
      app.remove_country(locationIdx);
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    selectMarket: (locationIdx: number) => {
      app.select_market(locationIdx);
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    addMarket: (locationIdx: number) => {
      app.add_market(locationIdx);
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    removeMarket: (locationIdx: number) => {
      app.remove_market(locationIdx);
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    addEntity: (locationIdx: number) => {
      app.add_entity(locationIdx);
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    removeEntity: (locationIdx: number) => {
      app.remove_entity(locationIdx);
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    setFocusedLocation: (locationIdx: number) => {
      app.set_focused_location(locationIdx);
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    clearFocus: () => {
      app.clear_focus();
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    clearFocusOrSelection: () => {
      app.clear_focus_or_selection();
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    selectPlayers: () => {
      app.select_players();
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    clearSelection: () => {
      app.clear_selection();
      const p = syncLocationData();
      selectionCallback?.(app.get_selection_summary());
      return p;
    },
    getMapModeRange: (mode: MapMode): MapModeRange => {
      return app.get_map_mode_range(mode);
    },
    getStateEfficacy: (): StateEfficacyData => {
      return app.get_state_efficacy();
    },

    getEntityHeader: (): EntityHeader | null => {
      return app.get_entity_header() ?? null;
    },
    getOverviewSection: (): OverviewSection | null => {
      return app.get_overview_section() ?? null;
    },
    getEconomySection: (): EconomySection | null => {
      return app.get_economy_section() ?? null;
    },
    getLocationsSection: (): LocationsSection | null => {
      return app.get_locations_section() ?? null;
    },
    getDiplomacySection: (): DiplomacySection | null => {
      return app.get_diplomacy_section() ?? null;
    },
    getLocationProfile: (locationIdx: number): LocationProfile | null => {
      return app.get_location_profile(locationIdx) ?? null;
    },

    getEntityBreakdown: (): EntityBreakdownData => {
      return app.get_entity_breakdown();
    },
    getLocationDistribution: (): LocationDistribution => {
      return app.get_location_distribution();
    },
    getDevelopmentInsight: (): DevelopmentInsightData => {
      return app.get_development_insight();
    },
    getPossibleTaxInsight: (): PossibleTaxInsightData => {
      return app.get_possible_tax_insight();
    },
    getPossibleTaxScope: (): PossibleTaxScope => {
      return app.get_possible_tax_scope();
    },
    getTaxGapInsight: (): TaxGapInsightData => {
      return app.get_tax_gap_insight();
    },
    getTaxGapScope: (): TaxGapScope => {
      return app.get_tax_gap_scope();
    },
    getMarketInsight: (): MarketInsightData => {
      return app.get_market_insight();
    },
    getScopeSummary: (): ScopeSummary => {
      return app.get_scope_summary();
    },
    getEntityHeaderFor: (anchorLocationIdx: number): EntityHeader | null => {
      return app.get_entity_header_for(anchorLocationIdx) ?? null;
    },
    getOverviewSectionFor: (anchorLocationIdx: number): OverviewSection | null => {
      return app.get_overview_section_for(anchorLocationIdx) ?? null;
    },
    getEconomySectionFor: (anchorLocationIdx: number): EconomySection | null => {
      return app.get_economy_section_for(anchorLocationIdx) ?? null;
    },
    getLocationsSectionFor: (anchorLocationIdx: number): LocationsSection | null => {
      return app.get_locations_section_for(anchorLocationIdx) ?? null;
    },
    getDiplomacySectionFor: (anchorLocationIdx: number): DiplomacySection | null => {
      return app.get_diplomacy_section_for(anchorLocationIdx) ?? null;
    },

    searchCountries: (query: string) => {
      const lower = query.toLowerCase();
      return countryIndex
        .filter(
          (c) =>
            c.capitalLocationIdx !== null &&
            c.capitalLocationIdx !== undefined &&
            (c.name.toLowerCase().includes(lower) || c.tag.toLowerCase().includes(lower)),
        )
        .slice(0, 20);
    },

    getLocationColorId: (locationIdx: number): number | null => {
      return app.center_at(locationIdx) ?? null;
    },
  });
};

let mapEndpoint: Eu5MapEndpoint | null = null;
let hoverDisplayCallback: ((data: HoverDisplayData) => void) | null = null;
let selectionCallback: ((data: SelectionSummaryData) => void) | null = null;

export async function initialize(port: MessagePort, level: wasm_eu5.LogLevel) {
  mapEndpoint = wrap<Eu5MapEndpoint>(port);
  await initialized;
  timeSync("Setup EU5 Wasm", () => wasm_eu5.setup_eu5_wasm(level));
}
