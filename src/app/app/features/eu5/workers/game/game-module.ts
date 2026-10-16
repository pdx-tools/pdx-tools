import type { MapInteraction } from "../../history/mapInteraction";
import type { MapFrame, MapObservation } from "../../history/analysisTypes";
import { LatestRequest } from "../../history/latestRequest";
import { MapFrameReader } from "../../history/framePort";
import { campaignIdentities, restoreCampaignView } from "./restoreCampaignView";
import type { Eu5Carry } from "../../campaignCarry";
import { fetchOk } from "@/lib/fetch";
import type { Eu5MapHoverTarget } from "../../useEu5MapHoverTarget";
import type {
  Eu5MapEndpoint,
  LocationClickChangeEvent,
  LocationHoverChangeEvent,
  MapDataSync,
} from "../map/map-module";
import type { BoxSelectCommitEvent } from "../../types/box-select";
import { eu5SaveFileUrl } from "../../store/types";
import type { Eu5ParsedSave } from "../../store/types";
import { timeAsync, timeSync } from "@/lib/timeit";
import init, * as wasm_eu5 from "../../../../wasm/wasm_eu5";
import type {
  ActiveProfileIdentity,
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
  PopulationGrowthInsightData,
  BuildingLevelsInsightData,
  ReligionInsightData,
  RgoInsightData,
  ControlInsightData,
  PoliticalWorldScoreboard,
  Eu5DateComponents,
  TimelineChange,
  TimelineData,
  MapChangeData,
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

/** Set once, before the first parse; every parse reads binary tokens. */
const tokensReady = Promise.all([initialized, tokensTask]).then(([, tokens]) =>
  timeSync("Set EU5 Tokens", () => wasm_eu5.set_tokens(new Uint8Array(tokens))),
);

/** Where a load gets the bundles of the save's patch. */
type GameBundleSource = {
  /** Reuse bundles only when the save patch matches the current map. */
  selectVersion: (version: string) => Promise<string | null>;
  fetch: () => Promise<Uint8Array>;
  fetchLocalization: () => Promise<Uint8Array>;
};

type OpenedBundles = {
  game: Promise<wasm_eu5.Eu5WasmGameBundle>;
  localization: Promise<wasm_eu5.Eu5WasmLocalizationBundle>;
};

/** Retain game bundles across compatible saves. */
let bundles: OpenedBundles | null = null;

function openBundles(source: GameBundleSource): OpenedBundles {
  if (bundles !== null) {
    return bundles;
  }

  const opened: OpenedBundles = {
    game: source
      .fetch()
      .then((data) => timeSync("Create game bundle", () => wasm_eu5.Eu5WasmGameBundle.open(data))),
    localization: source
      .fetchLocalization()
      .then((data) =>
        timeSync("Create localization bundle", () => wasm_eu5.Eu5WasmLocalizationBundle.open(data)),
      ),
  };

  const forget = () => {
    if (bundles === opened) bundles = null;
  };
  opened.game.catch(forget);
  opened.localization.catch(forget);

  bundles = opened;
  return opened;
}

type MapEvents = {
  hover: (event: LocationHoverChangeEvent) => void;
  click: (event: LocationClickChangeEvent) => void;
  boxSelect: (event: BoxSelectCommitEvent) => Promise<void>;
};

type OpenSave = {
  /** Route input to the displayed save during a transition. */
  events: MapEvents | null;
  close: () => void;
};

let openSave: OpenSave | null = null;

function closeSave() {
  const save = openSave;
  openSave = null;
  save?.close();
}

type SearchIndexes = {
  countries: ReturnType<wasm_eu5.Eu5App["get_countries"]>["countries"];
  locations: ReturnType<wasm_eu5.Eu5App["get_locations"]>["locations"];
};
// Indexes follow their parsed save without preventing eviction.
const indexes = new WeakMap<wasm_eu5.Eu5App, SearchIndexes>();
function searchIndexes(app: wasm_eu5.Eu5App) {
  let index = indexes.get(app);
  if (!index) {
    index = {
      countries: timeSync("Build country index", () => app.get_countries().countries),
      locations: timeSync("Build location index", () => app.get_locations().locations),
    };
    indexes.set(app, index);
  }
  return index;
}

let workQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(run: () => Promise<T>): Promise<T> {
  const job = workQueue.then(run);
  workQueue = job.catch(() => {});
  return job;
}

/**
 * Release the current save before parsing to limit memory use.
 * With `hold`, defer map changes until the caller restores the view and calls `show`.
 */
async function parseApp(
  saveData: Blob,
  gameBundle: GameBundleSource,
  onProgress?: (increment: number, stage: string) => void,
  beforeLocalize?: (workspace: wasm_eu5.Eu5WasmWorkspace) => Promise<void>,
  diagnose = true,
): Promise<wasm_eu5.Eu5App | null> {
  const [, tokens] = await Promise.all([initialized, tokensTask, tokensReady]);
  onProgress?.(10, "Parsing gamestate");
  const saveParser = await timeAsync("Initialize Save Parser", () =>
    wasm_eu5.SaveLoader.open(saveData),
  );
  const metadata = saveParser.meta();
  const version = `${metadata.version.major}.${metadata.version.minor}`;
  if ((await gameBundle.selectVersion(version)) === null) {
    saveParser.free();
    return null;
  }
  const { game: gameBundleTask, localization: localizationTask } = openBundles(gameBundle);
  const gamestate = await (async () => {
    try {
      return timeSync("Parse Gamestate", () => saveParser.parse_gamestate());
    } catch (originalError) {
      if (!diagnose) throw originalError;
      const { diagnoseEu5Save } = await import("./eu5-diagnostics");
      await diagnoseEu5Save(saveData, tokens);
      throw originalError;
    }
  })();
  onProgress?.(30, "Loading game data");

  const gameBundleWasm = await gameBundleTask;
  onProgress?.(5, "Building workspace");

  // Build the workspace first so the map worker can begin syncing
  // GPU buffers in parallel with the localization fetch.
  const workspace = timeSync("Initialize workspace", () =>
    wasm_eu5.Eu5WasmWorkspace.init(gamestate, gameBundleWasm),
  );
  onProgress?.(3, "Syncing locations");

  await beforeLocalize?.(workspace);
  const localizationBundle = await localizationTask;
  return workspace.localize(localizationBundle);
}

export const loadSave = (...args: Parameters<typeof loadSaveInner>) =>
  serialize(() => loadSaveInner(...args));

const loadSaveInner = async (
  {
    save,
    data: saveData,
    hold,
  }: {
    save: Eu5ParsedSave;
    data: Blob;
    hold: boolean;
  },
  {
    gameBundle,
    onProgress,
  }: {
    gameBundle: GameBundleSource;
    onProgress?: (increment: number, stage: string) => void;
  },
) => {
  // Wasm memory does not shrink, so the open save goes before this one is
  // parsed. Two gamestates at once would raise the memory of the page for
  // the rest of the session.
  closeSave();

  // Melt reads the save again, so that the worker does not keep a large
  // file in memory.
  const readFile = async () =>
    save.kind === "file"
      ? save.file.arrayBuffer()
      : fetchOk(eu5SaveFileUrl(save.saveId)).then((response) => response.arrayBuffer());

  const [wasm] = await Promise.all([initialized, tokensTask, tokensReady]);
  onProgress?.(5, "Reading save file");

  if (!mapEndpoint) throw new Error("Map endpoint not initialized");
  const map = mapEndpoint;
  const syncSave = (source: wasm_eu5.Eu5WasmWorkspace | wasm_eu5.Eu5App) => {
    const buffer = source.location_arrays();
    const locationArray = new Uint32Array(wasm.memory.buffer, buffer.ptr(), buffer.len());

    // Making a clone in the web worker instead of having the channel do a
    // structured clone is 100x faster on firefox. Decreased latency from 600ms
    // to 6ms.
    const locations = new Uint32Array(locationArray);
    const groupingTable = source.grouping_table();
    return map.syncSave(
      transfer({ locations, groupingTable }, [locations.buffer, groupingTable.buffer]),
    );
  };

  const app = await parseApp(saveData, gameBundle, onProgress, async (workspace) => {
    if (!hold) {
      map
        .open_view(workspace.opening_view())
        .catch((error: unknown) => console.warn("Failed to open the map view", error));
      await syncSave(workspace);
    }
  });
  if (!app) return null;
  let held = hold;
  let projectionActive = false;
  let inspectProjection: ((interaction: MapInteraction) => void) | null = null;

  // Search indexes belong only to the currently open save.
  const { countries: countryIndex, locations: locationIndex } = searchIndexes(app);

  // Render each palette into a CSS gradient string once. The palette stops
  // come from Rust (single source of truth with the shader); the FE only ever
  // sees opaque CSS strings keyed by palette tag.
  const paletteGradients: Record<GradientPalette, string> = {
    eu5: paletteToCss("eu5"),
  };

  const cloneBuffer = (buffer: { ptr(): number; len(): number }) => {
    const values = new Uint32Array(wasm.memory.buffer, buffer.ptr(), buffer.len());
    return new Uint32Array(values);
  };

  // Apply changed buffers together. A held save waits until `show`.
  const syncMapData = (data: MapDataSync) => {
    if (held) return Promise.resolve();
    const buffers = [data.colors?.buffer, data.flags?.buffer].filter((x) => x !== undefined);
    return map.syncMapData(transfer(data, buffers));
  };

  const syncFlagData = () => syncMapData({ flags: cloneBuffer(app.location_flag_data()) });

  const syncChangedData = (change: MapChangeData) => {
    if (!change.colorsChanged && !change.flagsChanged) {
      return Promise.resolve();
    }
    return syncMapData({
      colors: change.colorsChanged ? cloneBuffer(app.location_color_data()) : undefined,
      flags: change.flagsChanged ? cloneBuffer(app.location_flag_data()) : undefined,
    });
  };

  const syncGroupingTable = () => {
    if (held) return Promise.resolve();
    const raw = app.grouping_table();
    return map.syncGroupingTable(transfer(raw, [raw.buffer]));
  };

  const syncAll = (change: MapChangeData) => {
    const p = syncChangedData(change);
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
  const afterMutation = (change: MapChangeData) => {
    const p = syncChangedData(change);
    pushSelection(change.gradient ?? undefined);
    return p;
  };

  const events: MapEvents = {
    hover: (event) => {
      if (projectionActive) return;
      // Hover resolution is synchronous and worker messages are ordered. If
      // this handler becomes asynchronous, carry a generation through it.
      app.clear_highlights();

      if (event.kind === "update") {
        app.handle_location_hover(event.locationIdx);
        hoverDisplayCallback?.(app.get_hover_data(event.locationIdx));
      } else if (event.kind === "clear") {
        hoverDisplayCallback?.({ kind: "clear" });
      }

      syncFlagData();
    },

    click: (event) => {
      if (projectionActive) {
        inspectProjection?.({ kind: "click", event });
        return;
      }
      let change: MapChangeData;
      if (event.kind === "update") {
        const mods = event.modifiers;
        if (mods & SharedCanvasModifierBits.Shift) {
          change = app.add_entity(event.locationIdx);
        } else if (mods & SharedCanvasModifierBits.Alt) {
          change = app.remove_entity(event.locationIdx);
        } else {
          change = app.select_entity(event.locationIdx);
        }
      } else {
        change = app.clear_focus_or_selection();
      }
      afterMutation(change);
    },

    boxSelect: (event) => {
      if (projectionActive) {
        inspectProjection?.({ kind: "box", event });
        return Promise.resolve();
      }
      let change: MapChangeData;
      switch (event.operation) {
        case "add":
          change = app.apply_resolved_box_selection(event.locationIdxs, true);
          break;
        case "remove":
          change = app.apply_resolved_box_selection(event.locationIdxs, false);
          break;
        case "replace":
          change = app.replace_selection_with_locations(event.locationIdxs);
          break;
      }
      return afterMutation(change);
    },
  };

  let frameSource: { id: string; reader: MapFrameReader } | undefined;
  const opened: OpenSave = {
    events: held ? null : events,
    close: () => {
      frameSource?.reader.close();
      void projections.stop();
      app.free();
    },
  };
  openSave = opened;

  const applyProjection = async (frame: MapFrame, mode: MapMode): Promise<TimelineChange> => {
      if (openSave !== opened) throw Error("This save is no longer open");
      const groups = app.apply_map_projection(
        mode,
        frame.layoutKey,
        frame.locationIds,
        frame.fractions,
        frame.metrics,
        frame.owners,
        frame.controllers,
        frame.religions,
        frame.markets,
        frame.countries,
        frame.religionColors,
        frame.marketColors,
      );
      const change = app.map_projection_change();
      projectionActive = true;
      hoverDisplayCallback?.({ kind: "clear" });
      await Promise.all([
        syncMapData({
          colors: cloneBuffer(app.location_color_data()),
          flags: cloneBuffer(app.location_flag_data()),
        }),
        held ? Promise.resolve() : map.syncGroupingTable(transfer(groups, [groups.buffer])),
      ]);
      if (openSave !== opened) throw new DOMException("Save changed", "AbortError");
      return change;
  };
  const projections = new LatestRequest<{ hash: string; mode: MapMode }, { change: TimelineChange; observation: MapObservation }>(async ({ hash, mode }, current) => {
    if (!frameSource) throw Error("Campaign frame connection is not ready");
    const frame = await frameSource.reader.read(hash);
    if (!current() || openSave !== opened) throw new DOMException("Date changed", "AbortError");
    const change = await applyProjection(frame, mode);
    const { campaignId, date, dateSort, version, layoutKey, fileName, world } = frame;
    return { change, observation: { hash, campaignId, date, dateSort, version, layoutKey, fileName, world } };
  });
  return proxy({
    show: async (): Promise<void> => {
      if (!held || openSave !== opened) return;
      held = false;
      await syncSave(app);
      if (openSave === opened) opened.events = events;
    },
    replayMapInteraction: (interaction: MapInteraction) => {
      if (projectionActive || openSave !== opened) return;
      if (interaction.kind === "click") events.click(interaction.event);
      else if (interaction.kind === "box") return events.boxSelect(interaction.event);
      else {
        const id = interaction.args[0];
        const commands: Record<string, () => MapChangeData> = {
          selectCountry: () => app.select_country(id),
          addCountry: () => app.add_country(id),
          removeCountry: () => app.remove_country(id),
          selectMarket: () => app.select_market(id),
          addMarket: () => app.add_market(id),
          removeMarket: () => app.remove_market(id),
          setFocusedLocation: () => app.set_focused_location(id),
          clearFocus: () => app.clear_focus(),
          clearFocusOrSelection: () => app.clear_focus_or_selection(),
          selectPlayers: () => app.select_players(),
          clearSelection: () => app.clear_selection(),
        };
        const command = commands[interaction.name];
        if (command) return afterMutation(command());
      }
    },
    requestMapInspection: (interaction: MapInteraction) => {
      if (projectionActive) inspectProjection?.(interaction);
    },
    getMapLayoutKey: () => {
      if (openSave !== opened) throw new DOMException("Save changed", "AbortError");
      return app.map_projection_layout_key();
    },
    onMapInspect: (callback: ((interaction: MapInteraction) => void) | null) => {
      inspectProjection = callback;
    },
    connectMapFrames: (id: string, port: MessagePort | null) => {
      if (!port && frameSource?.id !== id) return;
      frameSource?.reader.close();
      frameSource = port ? { id, reader: new MapFrameReader(port) } : undefined;
    },
    stopMapProjection: () => projections.stop(),
    showMapObservation: (hash: string, mode: MapMode) => projections.request({ hash, mode }),
    clearMapProjection: async (): Promise<void> => {
      if (!projectionActive || openSave !== opened) return;
      projectionActive = false;
      app.restore_map_projection();
      await syncAll({ colorsChanged: true, flagsChanged: true, gradient: undefined });
    },
    setMapMode: async (mode: MapMode): Promise<TimelineChange> => {
      if (projectionActive) {
        projectionActive = false;
        app.restore_map_projection();
      }
      const change = app.set_map_mode(mode);
      await syncAll(change);
      if (openSave !== opened) throw new DOMException("Save changed", "AbortError");
      pushSelection(change.gradient ?? undefined);
      return change;
    },
    getTimeline: (): TimelineData => {
      return app.get_timeline();
    },
    setTimelineDate: async (date: Eu5DateComponents): Promise<TimelineChange> => {
      if (projectionActive) {
        projectionActive = false;
        app.restore_map_projection();
      }
      const before = app.get_map_mode();
      const change = app.set_timeline_date(date);
      // A date can force the political mode, which is a mode change like any
      // other; a move inside one mode repaints locations only.
      if (change.mapMode !== before) {
        await syncAll(change);
        pushSelection(change.gradient ?? undefined);
      } else {
        await syncChangedData(change);
      }
      return change;
    },
    getMapMode: () => {
      return app.get_map_mode();
    },
    getPaletteGradients: () => paletteGradients,
    getSaveMetadata: () => app.meta(),
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
    selectCountry: (countryIdx: number) => afterMutation(app.select_country(countryIdx)),
    addCountry: (countryIdx: number) => afterMutation(app.add_country(countryIdx)),
    removeCountry: (countryIdx: number) => afterMutation(app.remove_country(countryIdx)),
    selectMarket: (marketId: number) => afterMutation(app.select_market(marketId)),
    addMarket: (marketId: number) => afterMutation(app.add_market(marketId)),
    removeMarket: (marketId: number) => afterMutation(app.remove_market(marketId)),
    setFocusedLocation: (locationIdx: number) =>
      afterMutation(app.set_focused_location(locationIdx)),
    clearFocus: () => afterMutation(app.clear_focus()),
    clearFocusOrSelection: () => afterMutation(app.clear_focus_or_selection()),
    selectPlayers: () => afterMutation(app.select_players()),
    clearSelection: () => afterMutation(app.clear_selection()),
    highlightMapHoverTarget: (target: Eu5MapHoverTarget) => {
      if (projectionActive) return Promise.resolve();
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
      return syncFlagData();
    },
    clearMapHoverHighlight: () => {
      if (projectionActive) return Promise.resolve();
      app.clear_highlights();
      return syncFlagData();
    },
    getStateEfficacy: (): StateEfficacyInsightData => {
      return app.get_state_efficacy();
    },

    getMarketIdAtCenter: (center: number) => app.market_id_at_center(center),
    getCampaignIdentities: (profiles: ActiveProfileIdentity[]) =>
      campaignIdentities(app, countryIndex, profiles),
    restoreCampaignView: async (carry: Eu5Carry) => {
      const restored = restoreCampaignView(app, countryIndex, carry);
      await syncAll(restored.change);
      return restored;
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
    getPopulationGrowthInsight: (): PopulationGrowthInsightData => {
      return app.get_population_growth_insight();
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

    getCountryTag: (countryIdx: number): string | null => {
      return countryIndex.find((c) => c.country.key === countryIdx)?.tag ?? null;
    },

    /** Prefer a country that has land when dead countries share the tag. */
    findCountryByTag: (tag: string): number | null => {
      const match =
        countryIndex.find((c) => c.tag === tag && c.capital != null) ??
        countryIndex.find((c) => c.tag === tag);
      return match?.country.key ?? null;
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
  const map = wrap<Eu5MapEndpoint>(port);
  mapEndpoint = map;

  // Keep input handlers stable while changing the active save.
  map.onLocationHoverUpdate(proxy((event) => openSave?.events?.hover(event)));
  map.onLocationClickUpdate(proxy((event) => openSave?.events?.click(event)));
  map.onBoxSelectCommit(proxy((event) => openSave?.events?.boxSelect(event)));

  await initialized;
  timeSync("Setup EU5 Wasm", () => wasm_eu5.setup_eu5_wasm(level));
}
