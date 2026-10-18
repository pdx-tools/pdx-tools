import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Eu5UIEngine } from "../../ui-engine";
import type { GameInstance, PaletteGradients } from "../../game-adapter";
import type { MapFrame } from "../../history/analysisTypes";
import { serveMapFrames } from "../../history/framePort";
import type { ActiveProfileIdentity, GradientConfig, SelectionSummaryData } from "@/wasm/wasm_eu5";

const mocks = vi.hoisted(() => ({
  app: {} as Record<string, unknown>,
  map: {
    syncSave: vi.fn(),
    syncMapData: vi.fn(),
    syncGroupingTable: vi.fn(),
    onLocationHoverUpdate: vi.fn(),
    onLocationClickUpdate: vi.fn(),
    onBoxSelectCommit: vi.fn(),
  },
}));
vi.mock("comlink", () => ({
  proxy: (value: unknown) => value,
  transfer: (value: unknown) => value,
  wrap: () => mocks.map,
}));
vi.mock("@/lib/fetch", () => ({ fetchOk: async () => new Response(new Uint8Array()) }));
vi.mock("@/lib/timeit", () => ({
  timeSync: (_name: string, run: () => unknown) => run(),
  timeAsync: (_name: string, run: () => unknown) => run(),
}));
vi.mock("@/wasm/wasm_eu5", () => ({
  default: async () => ({ memory: { buffer: new ArrayBuffer(0) } }),
  set_tokens: vi.fn(),
  setup_eu5_wasm: vi.fn(),
  palette_stops: () => [],
  SaveLoader: {
    open: async () => ({
      meta: () => ({ version: { major: 1, minor: 0 } }),
      parse_gamestate: vi.fn(),
    }),
  },
  Eu5WasmGameBundle: { open: vi.fn() },
  Eu5WasmLocalizationBundle: { open: vi.fn() },
  Eu5WasmWorkspace: { init: () => ({ localize: () => mocks.app }) },
}));

const date = { year: 1360, month: 1, day: 1 };
const previewGradient: GradientConfig = {
  scale: "linear",
  palette: "eu5",
  minValue: 0,
  midValue: 50,
  maxValue: 100,
};
const restoredGradient: GradientConfig = { ...previewGradient, minValue: 20, maxValue: 80 };
const cleanup: (() => void)[] = [];
let selection: SelectionSummaryData;
let gradient: GradientConfig | undefined;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  gradient = restoredGradient;
  let projected = false;
  const buffer = () => ({ ptr: () => 0, len: () => 0 });
  mocks.app = {
    get_countries: () => ({ countries: [] }),
    get_locations: () => ({ locations: [] }),
    location_arrays: buffer,
    location_color_data: buffer,
    location_flag_data: buffer,
    grouping_table: () => new Uint32Array(),
    apply_map_projection: () => {
      projected = true;
      return new Uint32Array();
    },
    restore_map_projection: vi.fn(() => {
      projected = false;
    }),
    map_projection_change: () => ({
      mapMode: "control",
      date,
      gradient: projected ? previewGradient : gradient,
    }),
    get_selection_summary: () => selection,
  };
  mocks.map.syncSave.mockResolvedValue(undefined);
  mocks.map.syncMapData.mockResolvedValue(undefined);
  mocks.map.syncGroupingTable.mockResolvedValue(undefined);
});
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

async function open(profile?: ActiveProfileIdentity) {
  selection = {
    entityCount: profile ? 1 : 0,
    locationCount: profile ? 2 : 0,
    isEmpty: !profile,
    totalPopulation: 10,
    preset: undefined,
    focusedLocation: undefined,
    focusedLocationDisplayName: undefined,
    derivedEntityAnchor: undefined,
    scopeDisplayName: profile ? "Selected entity" : undefined,
    firstLocationIdx: undefined,
    activeProfile: profile,
  };
  const { initialize, loadSave } = await import("./game-module");
  await initialize({} as MessagePort, "error");
  const save = (await loadSave(
    { save: { kind: "file", file: new File(["save"], "first.eu5") }, data: new Blob(), hold: true },
    {
      gameBundle: {
        selectVersion: async () => "1.0",
        fetch: async () => new Uint8Array(),
        fetchLocalization: async () => new Uint8Array(),
      },
    },
  ))!;
  await save.show();
  const frame = (hash: string): MapFrame => ({
    hash,
    campaignId: "campaign",
    date: "1360-01-01",
    dateSort: 13600101,
    version: "1.0",
    layoutKey: "same",
    fileName: `${hash}.eu5`,
    world: { locationCount: 0, countryCount: 0, totalPopulation: 0 },
    locationIds: new Uint32Array(),
    fractions: new Uint16Array(),
    metrics: new Float32Array(),
    owners: new Uint32Array(),
    controllers: new Uint32Array(),
    religions: new Uint32Array(),
    markets: new Uint32Array(),
    countries: new Uint32Array(),
    religionColors: new Uint32Array(),
    marketColors: new Uint32Array(),
  });
  const channel = new MessageChannel();
  const stop = serveMapFrames(channel.port1, frame);
  save.connectMapFrames("test", channel.port2);
  cleanup.push(() => {
    save.connectMapFrames("test", null);
    stop();
  });
  const game: Partial<GameInstance> = {
    queries: {} as GameInstance["queries"],
    commands: {} as GameInstance["commands"],
    onHoverDisplayUpdate: vi.fn(),
    onSelectionUpdate: save.onSelectionUpdate,
    onBoxSelectRectUpdate: vi.fn(),
    onCursorHintUpdate: vi.fn(),
    onViewportChange: vi.fn(),
    startHoverTracking: vi.fn(),
    stopHoverTracking: vi.fn(),
    release: vi.fn(),
    showMapProjection: (observation, mode) => save.showMapObservation(observation.hash, mode),
    clearMapProjection: save.clearMapProjection,
  };
  const engine = new Eu5UIEngine(
    game as GameInstance,
    {} as PaletteGradients,
    {
      available: false,
      start: date,
      end: date,
      changeDays: [],
      changeCounts: [],
      notes: [],
    },
    { currentMapMode: "control", selectionState: selection },
  );
  return { engine, frame };
}

it.each<ActiveProfileIdentity>([
  { kind: "country", country: { key: 77, name: "France" } },
  { kind: "market", market: { key: 91, name: "Paris" } },
  { kind: "location", location: { key: 100, name: "Paris" } },
])(
  "restores $kind selection and its full-save gradient after previewing another date",
  async (profile) => {
    const { engine, frame } = await open(profile);
    await engine.trigger.showMapProjection(frame("second"));
    await engine.trigger.showMapProjection(frame("first"));
    expect(engine.getState().selectionState).toBeNull();
    const userRevision = engine.getState().userSelectionRevision;
    await engine.trigger.clearMapProjection();
    expect(engine.getState().mapProjection).toBeUndefined();
    expect(engine.getState().selectionState).toEqual(selection);
    expect(engine.getState().mapModeGradient).toEqual(restoredGradient);
    expect(engine.getState().userSelectionRevision).toBe(userRevision);
  },
);

it("publishes the current empty selection and clears the preview gradient when the save has none", async () => {
  const { engine, frame } = await open({ kind: "country", country: { key: 77, name: "France" } });
  await engine.trigger.showMapProjection(frame("second"));
  selection = { ...selection, activeProfile: undefined, isEmpty: true, entityCount: 0 };
  gradient = undefined;
  await engine.trigger.clearMapProjection();
  expect(engine.getState().selectionState?.isEmpty).toBe(true);
  expect(engine.getState().selectionState?.activeProfile).toBeUndefined();
  expect(engine.getState().mapModeGradient).toBeNull();
});

it("does not clear a newer preview when an earlier restoration finishes syncing", async () => {
  const { engine, frame } = await open();
  await engine.trigger.showMapProjection(frame("first"));
  const sync = Promise.withResolvers<void>();
  mocks.map.syncMapData.mockImplementationOnce(() => sync.promise);
  const restoring = engine.trigger.clearMapProjection();
  await engine.trigger.showMapProjection(frame("second"));
  sync.resolve();
  await restoring;
  expect(engine.getState().mapProjection?.hash).toBe("second");
  expect(engine.getState().selectionState).toBeNull();
  expect(engine.getState().mapModeGradient).toEqual(previewGradient);
});

it("does not publish a clear completion after its engine is destroyed", async () => {
  const { engine, frame } = await open();
  await engine.trigger.showMapProjection(frame("first"));
  const sync = Promise.withResolvers<void>();
  mocks.map.syncMapData.mockImplementationOnce(() => sync.promise);
  const restoring = engine.trigger.clearMapProjection();
  engine.destroy();
  const listener = vi.fn();
  engine.subscribe(listener);
  sync.resolve();
  await restoring;
  expect(listener).not.toHaveBeenCalled();
});
