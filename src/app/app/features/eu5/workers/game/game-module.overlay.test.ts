import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MapFrame } from "../../history/analysisTypes";
import { serveFrames } from "@/features/campaign/analysis/framePort";
import type { GradientConfig } from "@/wasm/wasm_eu5";
import type { LocationClickChangeEvent, LocationHoverChangeEvent } from "../map/map-module";
import type { BoxSelectCommitEvent } from "../../types/box-select";

const mocks = vi.hoisted(() => ({
  app: {} as Record<string, ReturnType<typeof vi.fn> | (() => unknown)>,
  map: {
    syncSave: vi.fn(),
    syncMapData: vi.fn(),
    syncGroupingTable: vi.fn(),
    presentOverlay: vi.fn(),
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

const gradient: GradientConfig = {
  scale: "linear",
  palette: "eu5",
  minValue: 0,
  midValue: 50,
  maxValue: 100,
};
const cleanup: (() => void)[] = [];

const frame = (id: string): MapFrame => ({
  descriptor: {
    id,
    game: "eu5",
    fileName: "test.eu5",
    countryNames: {},
    goods: [],
    marketLabels: {},
    population: 0,
    development: 0,
    campaignId: "campaign",
    contentHash: id,
    date: "1360-01-01",
    dateSort: 13600101,
    gameVersion: "1.0",
    extractorVersion: 1,
    artifacts: ["observations", "map"],
    layoutKey: "same",
    world: { locationCount: 0, countryCount: 0, totalPopulation: 0 },
  },
  projection: {
    layoutKey: "same",
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
  },
});

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  const buffer = () => ({ ptr: () => 0, len: () => 0 });
  const change = () => ({ colorsChanged: false, flagsChanged: true });
  mocks.app = {
    get_countries: () => ({ countries: [] }),
    get_locations: () => ({ locations: [] }),
    location_arrays: buffer,
    location_color_data: buffer,
    location_flag_data: buffer,
    grouping_table: () => new Uint32Array(),
    paint_map_projection: vi.fn(() => ({
      colors: new Uint32Array([1]),
      flags: new Uint32Array([2]),
      groups: new Uint32Array([3]),
      change: { gradient, colorsChanged: true, flagsChanged: true },
      free: vi.fn(),
    })),
    get_selection_summary: () => ({ isEmpty: true }),
    clear_highlights: vi.fn(),
    handle_location_hover: vi.fn(),
    get_hover_data: vi.fn(),
    select_entity: vi.fn(change),
    add_entity: vi.fn(change),
    remove_entity: vi.fn(change),
    clear_focus_or_selection: vi.fn(change),
    apply_resolved_box_selection: vi.fn(change),
    replace_selection_with_locations: vi.fn(change),
  };
  mocks.map.syncSave.mockResolvedValue(undefined);
  mocks.map.syncMapData.mockResolvedValue(undefined);
  mocks.map.syncGroupingTable.mockResolvedValue(undefined);
  mocks.map.presentOverlay.mockResolvedValue(true);
});
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

async function open() {
  const module = await import("./game-module");
  await module.initialize({} as MessagePort, "error");
  const save = (await module.loadSave(
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
  const channel = new MessageChannel();
  const stop = serveFrames(channel.port1, frame);
  save.connectMapFrames("test", channel.port2);
  cleanup.push(() => {
    save.connectMapFrames("test", null);
    stop();
  });
  const input = {
    hover: mocks.map.onLocationHoverUpdate.mock.calls[0][0] as (
      event: LocationHoverChangeEvent,
    ) => void,
    click: mocks.map.onLocationClickUpdate.mock.calls[0][0] as (
      event: LocationClickChangeEvent,
    ) => void,
    box: mocks.map.onBoxSelectCommit.mock.calls[0][0] as (event: BoxSelectCommitEvent) => void,
  };
  return { module, save, input };
}

it("paints a snapshot into the overlay and leaves the buffers of the save alone", async () => {
  const { save } = await open();
  mocks.map.syncMapData.mockClear();
  mocks.map.syncGroupingTable.mockClear();

  const reply = await save.presentOverlay("second", "control", 7);

  expect(reply).toMatchObject({ accepted: true, gradient, observation: { id: "second" } });
  expect(mocks.app.paint_map_projection).toHaveBeenCalledWith(
    "control",
    "same",
    ...Array.from({ length: 10 }, () => expect.anything()),
  );
  expect(mocks.map.presentOverlay).toHaveBeenCalledExactlyOnceWith({
    token: 7,
    colors: new Uint32Array([1]),
    flags: new Uint32Array([2]),
    groups: new Uint32Array([3]),
  });
  expect(mocks.map.syncMapData).not.toHaveBeenCalled();
  expect(mocks.map.syncGroupingTable).not.toHaveBeenCalled();
});

it("reports a frame that the map refused", async () => {
  const { save } = await open();
  mocks.map.presentOverlay.mockResolvedValueOnce(false);
  expect(await save.presentOverlay("second", "control", 3)).toMatchObject({ accepted: false });
});

it("keeps hover, click and box select away from the save during a preview", async () => {
  const { module, input } = await open();
  const onClick = vi.fn();
  module.setInputGate(onClick);
  // The gate clears the hover of the save once, so the tooltip does not stay.
  expect(mocks.app.handle_location_hover).not.toHaveBeenCalled();
  const clears = (mocks.app.clear_highlights as ReturnType<typeof vi.fn>).mock.calls.length;
  expect(clears).toBe(1);

  input.hover({ kind: "update", locationIdx: 5 });
  input.box({ locationIdxs: new Uint32Array([5]), operation: "replace" } as BoxSelectCommitEvent);
  const click = { kind: "update" as const, locationIdx: 5, modifiers: 0 };
  input.click(click);

  expect(mocks.app.handle_location_hover).not.toHaveBeenCalled();
  expect(mocks.app.replace_selection_with_locations).not.toHaveBeenCalled();
  expect(mocks.app.select_entity).not.toHaveBeenCalled();
  expect(onClick).toHaveBeenCalledExactlyOnceWith(click);

  module.setInputGate(null);
  input.click(click);
  expect(mocks.app.select_entity).toHaveBeenCalledExactlyOnceWith(5);
  expect(onClick).toHaveBeenCalledOnce();
});
