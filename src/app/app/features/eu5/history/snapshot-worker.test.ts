import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  parseCharts: vi.fn(),
  open: vi.fn(),
  meta: vi.fn(),
  free: vi.fn(),
  gameOpen: vi.fn(),
  localizationOpen: vi.fn(),
  resolveBundle: vi.fn(),
}));
vi.mock("../bundleUrls", () => ({
  resolveBundleVersion: mocks.resolveBundle,
  getBundleUrls: () => ({ game: "/game.zip", loc: "/loc-en.zip" }),
}));
vi.mock("comlink", () => ({ expose: vi.fn(), transfer: (value: unknown) => value }));
vi.mock("@sentry/react-router", () => ({ registerWebWorker: vi.fn() }));
vi.mock("@/wasm/wasm_eu5", () => ({
  default: vi.fn(),
  set_tokens: vi.fn(),
  ImportLoader: { open: mocks.open },
  Eu5WasmGameBundle: { open: mocks.gameOpen },
  Eu5WasmLocalizationBundle: { open: mocks.localizationOpen },
}));
import { parseImport } from "./snapshot-worker";
const snapshot = { descriptor: { id: "eu5:checksum" }, data: new Uint8Array([1]) };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([1]))),
  );
  mocks.open.mockResolvedValue({
    meta: mocks.meta,
    parse_import: mocks.parse,
    parse_import_with_charts: mocks.parseCharts,
    free: mocks.free,
  });
  mocks.meta.mockReturnValue({ playthroughId: "campaign", version: { major: 1, minor: 4 } });
  mocks.resolveBundle.mockImplementation(() => {
    throw Error("No assets");
  });
  mocks.parse.mockReturnValue(snapshot);
});
afterEach(() => vi.unstubAllGlobals());
it("uses one parser and preserves map and history when chart assets are unavailable", async () => {
  const file = new File(["save"], "test.eu5");
  const result = await parseImport(file);
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith(file);
  expect(mocks.parse).toHaveBeenCalledExactlyOnceWith();
  expect(result).toBe(snapshot);
  expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).includes("eu5.bin"))).toBe(true);
});
it("reuses initialization and parses a later file after an ordinary parse failure", async () => {
  mocks.parse.mockImplementationOnce(() => {
    throw Error("unknown field food");
  });
  await expect(parseImport(new File(["bad"], "bad.eu5"))).rejects.toThrow("unknown field food");
  await expect(parseImport(new File(["good"], "good.eu5"))).resolves.toBeDefined();
  expect(mocks.parse).toHaveBeenCalledTimes(2);
});
it("frees an unconsumed loader when campaign metadata is absent", async () => {
  mocks.meta.mockReturnValue({ playthroughId: "" });
  await expect(parseImport(new File(["save"], "bad.eu5"))).rejects.toThrow("campaign ID");
  expect(mocks.free).toHaveBeenCalledOnce();
  expect(mocks.parse).not.toHaveBeenCalled();
});
it("propagates asynchronous file failures without retrying a different parser", async () => {
  mocks.open.mockRejectedValue(Error("File changed"));
  await expect(parseImport(new File(["save"], "bad.eu5"))).rejects.toThrow("File changed");
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(mocks.parse).not.toHaveBeenCalled();
});

it("loads chart bundles once for compatible saves and frees them on a version change", async () => {
  const game = { free: vi.fn() };
  const localization = { free: vi.fn() };
  mocks.resolveBundle.mockImplementation((version: string) => version);
  mocks.gameOpen.mockReturnValueOnce(game).mockReturnValue({ free: vi.fn() });
  mocks.localizationOpen.mockReturnValueOnce(localization).mockReturnValue({ free: vi.fn() });
  mocks.parseCharts.mockReturnValue(snapshot);

  for (const name of ["a.eu5", "b.eu5"]) {
    await expect(parseImport(new File(["save"], name))).resolves.toBe(snapshot);
  }
  expect(mocks.gameOpen).toHaveBeenCalledOnce();
  expect(mocks.localizationOpen).toHaveBeenCalledOnce();
  expect(mocks.parseCharts.mock.calls).toEqual([
    [game, localization],
    [game, localization],
  ]);
  expect(mocks.parse).not.toHaveBeenCalled();

  mocks.meta.mockReturnValue({ playthroughId: "campaign", version: { major: 1, minor: 5 } });
  await parseImport(new File(["save"], "c.eu5"));
  expect(mocks.gameOpen).toHaveBeenCalledTimes(2);
  expect(game.free).toHaveBeenCalledOnce();
  expect(localization.free).toHaveBeenCalledOnce();
});
