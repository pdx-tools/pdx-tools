import { cachedPlayback, deletePlaybackCache } from "../../history/playbackCache";
import { campaignIdentities, restoreCampaignView } from "./restoreCampaignView";
import type { Eu5Carry } from "../../campaignCarry";
import { PreparedSaves } from "./preparedSaves";
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
  /**
   * Choose the bundles for the patch of the save. Resolves the version of
   * the bundles to use, or null when the map shows the bundles of another
   * patch. Such a save needs new workers.
   */
  selectVersion: (version: string) => Promise<string | null>;
  fetch: () => Promise<Uint8Array>;
  fetchLocalization: () => Promise<Uint8Array>;
};

type OpenedBundles = {
  game: Promise<wasm_eu5.Eu5WasmGameBundle>;
  localization: Promise<wasm_eu5.Eu5WasmLocalizationBundle>;
};

/**
 * The bundles of the patch that this worker serves. The first save
 * chooses the patch. A save of another patch gets new workers. Thus the
 * bundles open one time, and the next saves of the campaign use them again.
 */
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

  // A bundle that failed to open must not stay for the next save.
  const forget = () => {
    if (bundles === opened) bundles = null;
  };
  opened.game.catch(forget);
  opened.localization.catch(forget);

  bundles = opened;
  return opened;
}

/** Map input for the open save. */
type MapEvents = {
  hover: (event: LocationHoverChangeEvent) => void;
  click: (event: LocationClickChangeEvent) => void;
  boxSelect: (event: BoxSelectCommitEvent) => Promise<void>;
};

/** The save that this worker serves. */
type OpenSave = {
  /** Null until the map shows this save, so input goes to the save on screen. */
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

const prepared = new PreparedSaves<wasm_eu5.Eu5App>((app) => app.free());
let uncachedActiveBytes = 0;
let workQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(run: () => Promise<T>): Promise<T> {
  const job = workQueue.then(run);
  workQueue = job.catch(() => {});
  return job;
}

/**
 * Parse a save and serve it. The save that was open closes first. The
 * caller reads the bytes of the save, so a save that cannot be read never
 * closes the open one.
 *
 * With `hold`, the map keeps the previous save until a call to `show`.
 * Thus the caller can set the map mode and selection first, and the map
 * changes one time.
 */
async function parseApp(
  saveData: ArrayBuffer,
  gameBundle: GameBundleSource,
  onProgress?: (increment: number, stage: string) => void,
  beforeLocalize?: (workspace: wasm_eu5.Eu5WasmWorkspace) => Promise<void>,
  diagnose = true,
  playback = false,
): Promise<wasm_eu5.Eu5App | null> {
  const [, tokens] = await Promise.all([initialized, tokensTask, tokensReady]);
  onProgress?.(10, "Parsing gamestate");
  const cachedGame = playback
    ? timeSync("Restore playback cache", () =>
        wasm_eu5.Eu5WasmGamestate.from_playback_cache(new Uint8Array(saveData)),
      )
    : undefined;
  const saveParser = cachedGame
    ? undefined
    : wasm_eu5.Eu5MetaParser.create().init(new Uint8Array(saveData));
  const metadata = cachedGame ? cachedGame.meta() : saveParser!.meta();
  const version = `${metadata.version.major}.${metadata.version.minor}`;
  if ((await gameBundle.selectVersion(version)) === null) {
    cachedGame?.free();
    saveParser?.free();
    return null;
  }
  const { game: gameBundleTask, localization: localizationTask } = openBundles(gameBundle);
  const gamestate = await (async () => {
    if (cachedGame) return cachedGame;
    try {
      return timeSync("Parse Gamestate", () => saveParser!.parse_gamestate());
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

export const hasPreparedSave = (cacheKey: string) =>
  serialize(async () => !!prepared.get(cacheKey));

export const prepareSave = (
  file: File,
  cacheKey: string,
  playbackHash: string | undefined,
  gameBundle: GameBundleSource,
) =>
  serialize(async () => {
    const existing = prepared.get(cacheKey);
    if (existing) {
      searchIndexes(existing);
      return true;
    }
    if (playbackHash) {
      const bytes = await cachedPlayback(playbackHash).catch(async () => {
        await deletePlaybackCache(playbackHash).catch(() => {});
        return undefined;
      });
      if (bytes && prepared.makeRoom(bytes.byteLength * 3 + uncachedActiveBytes)) {
        let app: wasm_eu5.Eu5App | null = null;
        try {
          app = await parseApp(bytes, gameBundle, undefined, undefined, false, true);
        } catch {
          await deletePlaybackCache(playbackHash).catch(() => {});
        }
        if (app) {
          if (prepared.add(cacheKey, app, app.retained_save_bytes())) {
            searchIndexes(app);
            return true;
          }
          app.free();
          return false;
        }
      }
    }
    if (!prepared.makeRoom(file.size * 2 + uncachedActiveBytes)) return false;
    const app = await parseApp(await file.arrayBuffer(), gameBundle, undefined, undefined, false);
    if (!app) return false;
    if (prepared.add(cacheKey, app, app.retained_save_bytes())) {
      searchIndexes(app);
      return true;
    }
    app.free();
    return false;
  });

const loadSaveInner = async (
  {
    save,
    data: saveData,
    hold,
    cacheKey,
    playbackHash,
  }: {
    save: Eu5ParsedSave;
    data: ArrayBuffer;
    hold: boolean;
    cacheKey?: string;
    playbackHash?: string;
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

  let app = cacheKey ? prepared.get(cacheKey) : undefined;
  let retained = !!app;
  if (!app && playbackHash) {
    const bytes = await cachedPlayback(playbackHash).catch(async () => {
      await deletePlaybackCache(playbackHash).catch(() => {});
      return undefined;
    });
    if (bytes) {
      prepared.makeRoom(bytes.byteLength * 2);
      try {
        app = (await parseApp(bytes, gameBundle, onProgress, undefined, false, true)) ?? undefined;
      } catch (error) {
        console.warn("Discarding unusable playback cache", error);
        await deletePlaybackCache(playbackHash).catch(() => {});
      }
      if (app) retained = !!cacheKey && prepared.add(cacheKey, app, app.retained_save_bytes());
    }
  }
  if (!app) {
    // A prepared save may have been evicted after the main-thread cache check.
    if (saveData.byteLength === 0) saveData = await readFile();
    // Release inactive saves before parsing; a large save can still load uncached.
    prepared.makeRoom(saveData.byteLength * 2);
    const parsed = await parseApp(saveData, gameBundle, onProgress, async (workspace) => {
      if (!hold) {
        map.open_view(workspace.opening_view()).catch((error: unknown) => {
          console.warn("Failed to open the map view", error);
        });
        await syncSave(workspace);
      }
    });
    if (!parsed) return null;
    app = parsed;
    retained = !!cacheKey && prepared.add(cacheKey, app, app.retained_save_bytes());
  } else {
    app.clear_selection();
    app.clear_highlights();
    app.set_map_mode("political");
    app.set_timeline_date(app.meta().date);
  }
  prepared.active = retained ? cacheKey! : null;
  uncachedActiveBytes = retained ? 0 : app.retained_save_bytes();
  let held = hold;

  // Preparation already built these; cold saves initialize them once here.
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

  // Send the stale location buffers to the map worker in one message. While
  // the map holds the previous save, `show` sends all of them instead.
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

  const opened: OpenSave = {
    events: held ? null : events,
    close: () => {
      prepared.active = null;
      uncachedActiveBytes = 0;
      if (!retained) app.free();
    },
  };
  openSave = opened;

  return proxy({
    /** Show this save on the map, after a load with `hold`. */
    show: async (): Promise<void> => {
      if (!held || openSave !== opened) return;
      held = false;
      await syncSave(app);
      opened.events = events;
    },
    setMapMode: async (mode: MapMode): Promise<TimelineChange> => {
      const change = app.set_map_mode(mode);
      await syncAll(change);
      pushSelection(change.gradient ?? undefined);
      return change;
    },
    getTimeline: (): TimelineData => {
      return app.get_timeline();
    },
    setTimelineDate: async (date: Eu5DateComponents): Promise<TimelineChange> => {
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
    getHistoryContext: () => {
      const version = app.meta().version;
      return {
        countryNames: Object.fromEntries(
          countryIndex.map((entry) => [entry.tag, entry.country.name]),
        ),
        version: `${version.major}.${version.minor}.${version.patch}`,
      };
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

  // Map input goes to whichever save is open, so a new save does not
  // register its handlers again.
  map.onLocationHoverUpdate(proxy((event) => openSave?.events?.hover(event)));
  map.onLocationClickUpdate(proxy((event) => openSave?.events?.click(event)));
  map.onBoxSelectCommit(proxy((event) => openSave?.events?.boxSelect(event)));

  await initialized;
  timeSync("Setup EU5 Wasm", () => wasm_eu5.setup_eu5_wasm(level));
}
