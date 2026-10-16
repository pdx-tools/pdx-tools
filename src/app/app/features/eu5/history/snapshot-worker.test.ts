import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  meta: vi.fn(),
  free: vi.fn(),
  open: vi.fn(),
  gameOpen: vi.fn(),
  locOpen: vi.fn(),
}));
vi.mock("comlink", () => ({ expose: vi.fn(), transfer: (value: unknown) => value }));
vi.mock("@sentry/react-router", () => ({ registerWebWorker: vi.fn() }));
vi.mock("../bundleUrls", () => ({
  getBundleUrls: () => ({ game: "/game.zip", loc: "/loc.zip" }),
  resolveBundleVersion: (v: string) => v,
}));
vi.mock("@/wasm/wasm_eu5", () => ({
  default: vi.fn(),
  set_tokens: vi.fn(),
  ImportLoader: { open: mocks.open },
  Eu5WasmGameBundle: { open: mocks.gameOpen },
  Eu5WasmLocalizationBundle: { open: mocks.locOpen },
}));
import { parseImport } from "./snapshot-worker";
import { snapshotView } from "./packedSnapshot";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => new Response(new Uint8Array([1]))),
  );
  const parser = { meta: mocks.meta, parse_import: mocks.parse, free: mocks.free };
  mocks.open.mockResolvedValue(parser);
  mocks.meta.mockReturnValue({ playthroughId: "campaign", version: { major: 1, minor: 4 } });
  mocks.gameOpen.mockReturnValue({ free: vi.fn() });
  mocks.locOpen.mockReturnValue({ free: vi.fn() });
  mocks.parse.mockReturnValue({
    snapshot: {
      campaignId: "campaign",
      date: "1360-01-01",
      dateSort: 13600101,
      version: "1.4.0",
      countries: [],
      markets: [],
      population: 0,
      development: 0,
    },
    hash: "checksum",
    projection: {},
    overviews: { world: { population: 0 } },
    countryIds: [7],
    countryNames: new Map([[7, "England"]]),
  });
  vi.stubGlobal(
    "indexedDB",
    new Proxy(
      {},
      {
        get: () => {
          throw Error("Disk caching is forbidden");
        },
      },
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());
it("uses one full parser and returns transferable analytical columns without disk writes", async () => {
  const result = await parseImport(new File(["save"], "test.eu5"));
  expect(mocks.parse).toHaveBeenCalledOnce();
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(result.snapshot.hash).toBe("eu5:checksum");
  expect(snapshotView(result.snapshot).countries).toEqual([]);
  expect(result.countryIds).toEqual(new Uint32Array([7]));
  expect(result.countryNames).toEqual({ 7: "England" });
  expect(result).not.toHaveProperty("recording");
});
it("keeps unnamed market centers selectable with an ID-based label", async () => {
  mocks.parse.mockReturnValue({
    snapshot: {
      campaignId: "campaign",
      date: "1360-01-01",
      dateSort: 13600101,
      version: "1.4.0",
      countries: [],
      markets: [
        { center: 42, centerName: "New_York", marketId: 1, good: "grain" },
        { center: 73, centerName: undefined, marketId: 2, good: "iron" },
      ],
      population: 0,
      development: 0,
    },
    hash: "checksum",
    projection: {},
    overviews: { world: { population: 0 } },
    countryIds: [7],
    countryNames: new Map([[7, "England"]]),
  });

  const result = await parseImport(new File(["save"], "test.eu5"));

  expect(result.snapshot.marketLabels).toEqual({ 42: "New York", 73: "Location 73" });
});
it.each(["SAV01000text", "PKcompressed"])(
  "passes the original Blob to the format-aware loader (%s)",
  async (content) => {
    const file = new File([content], "test.eu5");
    const whole = vi.spyOn(file, "arrayBuffer");
    await parseImport(file);
    expect(mocks.open).toHaveBeenCalledExactlyOnceWith(file);
    expect(whole).not.toHaveBeenCalled();
    expect(mocks.parse).toHaveBeenCalledOnce();
  },
);
it("reports asynchronous loader failures without another loading path", async () => {
  mocks.open.mockRejectedValue(Error("the save file changed on disk while it was read"));
  await expect(parseImport(new File(["save"], "changed.eu5"))).rejects.toThrow("changed on disk");
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(mocks.parse).not.toHaveBeenCalled();
});
it("rejects parser failures without a selective-parser retry", async () => {
  mocks.parse.mockImplementation(() => {
    throw Error("unknown field food");
  });
  await expect(parseImport(new File(["save"], "broken.eu5"))).rejects.toThrow("unknown field food");
  expect(mocks.parse).toHaveBeenCalledOnce();
});
it("releases an unconsumed loader when metadata or assets fail", async () => {
  mocks.meta.mockReturnValue({ playthroughId: "", version: { major: 1, minor: 4 } });
  await expect(parseImport(new File(["save"], "empty.eu5"))).rejects.toThrow("campaign ID");
  expect(mocks.free).toHaveBeenCalledOnce();
  expect(mocks.parse).not.toHaveBeenCalled();
});
it("releases an opened game bundle if localization cannot be opened", async () => {
  mocks.meta.mockReturnValue({ playthroughId: "campaign", version: { major: 1, minor: 5 } });
  const free = vi.fn();
  mocks.gameOpen.mockReturnValue({ free });
  mocks.locOpen.mockImplementation(() => {
    throw Error("Invalid localization bundle");
  });
  await expect(parseImport(new File(["save"], "test.eu5"))).rejects.toThrow(
    "Invalid localization bundle",
  );
  expect(free).toHaveBeenCalledOnce();
  expect(mocks.free).toHaveBeenCalledOnce();
  expect(mocks.parse).not.toHaveBeenCalled();
});

it("reuses loaded bundles across saves in a worker batch", async () => {
  await parseImport(new File(["a"], "a.eu5"));
  await parseImport(new File(["b"], "b.eu5"));
  expect(mocks.parse).toHaveBeenCalledTimes(2);
  expect(mocks.gameOpen.mock.calls.length).toBeLessThanOrEqual(1);
});
