import { fetchOk } from "@/lib/fetch";
import type { Eu5MapHoverTarget } from "../../useEu5MapHoverTarget";
import type { Eu5MapEndpoint, MapDataSync } from "../map/map-module";
import type { Eu5SaveInput } from "../../store/types";
import { timeAsync, timeSync } from "@/lib/timeit";
import init, * as wasm_eu5 from "../../../../wasm/wasm_eu5";
import type {
  MapMode,
  ActiveProfileIdentity,
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
    onProgress?: (increment: number, stage: string) => void;
  },
) => {
  let activeSave = save;
  const readFile = async () => {
    switch (activeSave.kind) {
      case "handle":
        return (await activeSave.file.getFile()).arrayBuffer();
      case "file":
        return activeSave.file.arrayBuffer();
      case "server":
        return fetchOk(`/api/eu5/saves/${activeSave.saveId}/file`).then((response) =>
          response.arrayBuffer(),
        );
    }
  };

  const saveDataTask = timeAsync("Read Save File", () => readFile());

  const [wasm, tokens] = await Promise.all([initialized, tokensTask]);
  timeSync("Set EU5 Tokens", () => wasm_eu5.set_tokens(new Uint8Array(tokens)));
  onProgress?.(5, "Reading save file");

  const metaParser = timeSync("Create Meta Parser", () => wasm_eu5.Eu5MetaParser.create());

  const saveData = await saveDataTask;
  // Hashing runs alongside parsing/localization instead of delaying the ready view.
  const saveHashTask = crypto.subtle.digest("SHA-256", saveData);
  onProgress?.(10, "Parsing gamestate");

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
  onProgress?.(30, "Loading game data");

  const gameBundleData = await gameDataTask;
  const gameBundleWasm = timeSync("Create game bundle", () =>
    wasm_eu5.Eu5WasmGameBundle.open(gameBundleData),
  );
  onProgress?.(5, "Building workspace");

  // Build the workspace first so the map worker can begin syncing
  // GPU buffers in parallel with the localization fetch.
  const workspace = timeSync("Initialize workspace", () =>
    wasm_eu5.Eu5WasmWorkspace.init(gamestate, gameBundleWasm),
  );
  onProgress?.(3, "Syncing locations");

  if (!mapEndpoint) {
    throw new Error("Map endpoint not initialized");
  }
  const map = mapEndpoint;

  // Do not wait: the map worker can still be loading its textures, and the
  // parse does not need the view. A failure keeps the default view.
  map.open_view(workspace.opening_view()).catch((error: unknown) => {
    console.warn("Failed to open the map view", error);
  });

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
  onProgress?.(5, "Localizing");

  const localizationBundle = await localizationTask;
  onProgress?.(2, "Building indexes");

  let app = timeSync("Localize app", () => workspace.localize(localizationBundle));

  // Build search indexes once after initialization.
  let countryIndex = timeSync("Build country index", () => app.get_countries().countries);
  let locationIndex = timeSync("Build location index", () => app.get_locations().locations);

  // Active plus at most two upcoming dates, with an estimated 768 MiB arena budget.
  // Shared assets are excluded from this budget; Wasm capacity can remain higher.
  const initialHash = Array.from(new Uint8Array(await saveHashTask), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  let activeHash = initialHash;
  const prepared = new Map<string, wasm_eu5.Eu5App>([[activeHash, app]]);
  const describe = (item: wasm_eu5.Eu5App) => ({
    metadata: item.meta(),
    timeline: item.get_timeline(),
    countries: item.get_countries().countries,
    locations: item.get_locations().locations,
  });
  const preparedInfo = new Map([
    [
      initialHash,
      {
        metadata: app.meta(),
        timeline: app.get_timeline(),
        countries: countryIndex,
        locations: locationIndex,
      },
    ],
  ]);
  const snapshotQueue: { run: () => Promise<void>; foreground: boolean }[] = [];
  let processingSnapshot = false;
  const drainSnapshots = async () => {
    if (processingSnapshot) return;
    processingSnapshot = true;
    try {
      while (snapshotQueue.length) {
        const urgent = snapshotQueue.findIndex((task) => task.foreground);
        const [task] = snapshotQueue.splice(urgent < 0 ? 0 : urgent, 1);
        await task.run();
      }
    } finally {
      processingSnapshot = false;
    }
  };
  const queued = <T>(action: () => Promise<T>, foreground = false): Promise<T> => {
    const result = new Promise<T>((resolve, reject) => {
      snapshotQueue.push({
        foreground,
        run: async () => {
          try {
            resolve(await action());
          } catch (error) {
            reject(error);
          }
        },
      });
    });
    void drainSnapshots();
    return result;
  };
  const prepare = async (file: File, hash: string) => {
    const cached = prepared.get(hash);
    if (cached) return cached;
    // Evict oldest non-active states before parsing, allowing two-date lookahead
    // only when the estimated arena budget permits it.
    const estimatedBytes = app.retained_save_bytes();
    let retainedBytes = [...prepared.values()].reduce(
      (sum, item) => sum + item.retained_save_bytes(),
      0,
    );
    for (const [key, old] of prepared)
      if (
        key !== activeHash &&
        (prepared.size >= 3 || retainedBytes + estimatedBytes > 768 * 1024 * 1024)
      ) {
        retainedBytes -= old.retained_save_bytes();
        prepared.delete(key);
        preparedInfo.delete(key);
        old.free();
      }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parser = wasm_eu5.Eu5MetaParser.create().init(bytes);
    const nextMeta = parser.meta();
    if (
      nextMeta.playthroughId !== metadata.playthroughId ||
      JSON.stringify(nextMeta.version) !== JSON.stringify(metadata.version)
    ) {
      parser.free();
      throw new Error("Saved-date playback requires the same campaign and full game version.");
    }
    const state = parser.parse_gamestate();
    const next = app.for_save(state);
    preparedInfo.set(hash, describe(next));
    prepared.set(hash, next);
    return next;
  };

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

  // Send the stale location buffers to the map worker in one message.
  const syncMapData = (data: MapDataSync) => {
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

  map.onLocationHoverUpdate(
    proxy((event) => {
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
    }),
  );

  map.onLocationClickUpdate(
    proxy((event) => {
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
    }),
  );

  map.onBoxSelectCommit(
    proxy((event) => {
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
    }),
  );

  return proxy({
    prepareSnapshot: (file: File, hash: string, distance = 1) =>
      queued(async () => {
        // Extra lookahead must never evict the nearer date to fit the budget.
        const retained = [...prepared.values()].reduce(
          (sum, item) => sum + item.retained_save_bytes(),
          0,
        );
        if (
          distance > 1 &&
          !prepared.has(hash) &&
          (prepared.size >= 3 || retained + app.retained_save_bytes() > 768 * 1024 * 1024)
        )
          return;
        await prepare(file, hash);
      }),
    switchSnapshot: (file: File, hash: string, mode: MapMode, viewed?: ActiveProfileIdentity[]) =>
      queued(async () => {
        const before = app.get_selection_summary();
        const identity = before.activeProfile;
        const countryTag =
          identity?.kind === "country"
            ? countryIndex.find((c) => c.country.key === identity.country.key)?.tag
            : undefined;
        const marketCenter =
          identity?.kind === "market" ? app.market_center_id(identity.market.key) : undefined;
        const locationName = identity?.kind === "location" ? identity.location.name : undefined;
        const viewedIdentities = (viewed ?? []).map((profile) => ({
          profile,
          tag:
            profile.kind === "country"
              ? countryIndex.find((c) => c.country.key === profile.country.key)?.tag
              : undefined,
          center: profile.kind === "market" ? app.market_center_id(profile.market.key) : undefined,
        }));
        const next = await prepare(file, hash);
        next.clear_selection();
        next.clear_highlights();
        next.set_map_mode(mode);
        const info = preparedInfo.get(hash)!;
        const countries = info.countries;
        const locations = info.locations;
        const country = countryTag ? countries.find((c) => c.tag === countryTag) : undefined;
        const location = locationName
          ? locations.find((l) => l.location.name === locationName)
          : undefined;
        if (country) next.select_country(country.country.key);
        if (location) next.set_focused_location(location.location.key);
        if (marketCenter !== undefined) {
          const marketId = next.market_id_at_center(marketCenter);
          if (marketId != null) next.select_market(marketId);
        }
        // One worker message replaces all dynamic buffers; the camera and textures stay alive.
        const change = next.set_map_mode(mode);
        const colors = cloneBuffer(next.location_arrays());
        const groups = next.grouping_table();
        await map.syncSnapshot(
          transfer(colors, [colors.buffer]),
          transfer(groups, [groups.buffer]),
        );
        const viewedProfiles: ActiveProfileIdentity[] = [];
        for (const { profile, tag, center } of viewedIdentities) {
          let remapped: ActiveProfileIdentity | null = null;
          if (profile.kind === "country" && tag) {
            const match = countries.find((c) => c.tag === tag);
            if (match) remapped = { kind: "country", country: match.country };
          } else if (profile.kind === "location") {
            const match = locations.find((l) => l.location.name === profile.location.name);
            if (match) remapped = { kind: "location", location: match.location };
          } else if (profile.kind === "market" && center != null) {
            const marketId = next.market_id_at_center(center);
            if (marketId != null) {
              const header = next.get_market_profile(marketId)?.header;
              if (header)
                remapped = { kind: "market", market: { key: marketId, name: header.name } };
            }
          }
          // Descendants of a vanished breadcrumb cannot retain the old save's indices.
          if (!remapped) break;
          viewedProfiles.push(remapped);
        }
        const previousHash = activeHash;
        app = next;
        activeHash = hash;
        // The old active state is behind us: reserve its slot for future dates.
        if (previousHash !== hash) {
          const previous = prepared.get(previousHash);
          prepared.delete(previousHash);
          preparedInfo.delete(previousHash);
          previous?.free();
        }
        activeSave = { kind: "file", file };
        countryIndex = countries;
        locationIndex = locations;
        pushSelection(change.gradient ?? undefined);
        hoverDisplayCallback?.({ kind: "clear" });
        return {
          viewedProfiles,
          metadata: info.metadata,
          timeline: info.timeline,
          change,
        };
      }, true),
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
    getSaveMetadata: () => preparedInfo.get(activeHash)!.metadata,
    getCountryNames: () =>
      Object.fromEntries(countryIndex.map((entry) => [entry.tag, entry.country.name])),
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
  mapEndpoint = wrap<Eu5MapEndpoint>(port);
  await initialized;
  timeSync("Setup EU5 Wasm", () => wasm_eu5.setup_eu5_wasm(level));
}
