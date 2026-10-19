import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ parse: vi.fn(), open: vi.fn(), meta: vi.fn(), free: vi.fn() }));
vi.mock("comlink", () => ({ expose: vi.fn(), transfer: (value: unknown) => value }));
vi.mock("@sentry/react-router", () => ({ registerWebWorker: vi.fn() }));
vi.mock("@/wasm/wasm_eu5", () => ({
  default: vi.fn(),
  set_tokens: vi.fn(),
  ImportLoader: { open: mocks.open },
}));
import { parseImport } from "./snapshot-worker";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1]))));
  mocks.open.mockResolvedValue({ meta: mocks.meta, parse_import: mocks.parse, free: mocks.free });
  mocks.meta.mockReturnValue({ playthroughId: "campaign" });
  mocks.parse.mockReturnValue({
    observation: { contentHash: "checksum", extractorVersion: 1, campaignId: "campaign" },
    projection: {},
  });
});
afterEach(() => vi.unstubAllGlobals());
it("uses one full parser with no game or localization asset reads", async () => {
  const file = new File(["save"], "test.eu5");
  const result = await parseImport(file);
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith(file);
  expect(mocks.parse).toHaveBeenCalledExactlyOnceWith();
  expect(result.descriptor).toMatchObject({
    id: "eu5:1:checksum",
    game: "eu5",
    contentHash: "checksum",
    artifacts: ["observations", "map"],
  });
  expect(result.descriptor).not.toHaveProperty("fileName");
  expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).includes("eu5.bin"))).toBe(true);
});
it("refuses parser output from another extractor version", async () => {
  mocks.parse.mockReturnValue({
    observation: { contentHash: "checksum", extractorVersion: 2, campaignId: "campaign" },
    projection: {},
  });
  await expect(parseImport(new File(["save"], "test.eu5"))).rejects.toThrow("accepts 1");
});
it("accepts the extractor version of the Rust extractor", async () => {
  const { readFile } = await import("node:fs/promises");
  const { EU5_EXTRACTOR_VERSION } = await import("./analysisTypes");
  const rust = await readFile(
    new URL("../../../../../eu5app/src/map_projection.rs", import.meta.url),
    "utf8",
  );
  expect(rust).toContain(`pub const EXTRACTOR_VERSION: u32 = ${EU5_EXTRACTOR_VERSION};`);
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
