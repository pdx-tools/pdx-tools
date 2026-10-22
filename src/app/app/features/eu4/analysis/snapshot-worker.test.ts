import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ parse: vi.fn(), init: vi.fn(), tokens: vi.fn() }));
vi.mock("comlink", () => ({ expose: vi.fn(), transfer: (value: unknown) => value }));
vi.mock("@sentry/react-router", () => ({ registerWebWorker: vi.fn() }));
vi.mock("@/wasm/wasm_eu4", () => ({
  default: mocks.init,
  set_tokens: mocks.tokens,
  parse_analysis: mocks.parse,
}));
import { parseImport } from "./snapshot-worker";

const observation = (extractorVersion = 1) => ({
  contentHash: "checksum",
  extractorVersion,
  campaignId: "playthrough",
  date: "1444-11-11",
  dateSort: 14441111,
  gameVersion: "1.37.5.0",
  layoutKey: "layout",
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1]))));
  mocks.parse.mockReturnValue({ observation: observation(), provinces: { layoutKey: "layout" } });
});
afterEach(() => vi.unstubAllGlobals());

it("keeps the campaign identity and province data from the parsed save", async () => {
  const provinces = {
    layoutKey: "layout",
    provinceIds: new Uint32Array([101, 104]),
    development: new Float32Array([10, 20]),
    owned: new Uint8Array([1, 0]),
  };
  mocks.parse.mockReturnValue({ observation: observation(), provinces });
  const result = await parseImport(new File(["save"], "test.eu4"));
  expect(mocks.parse).toHaveBeenCalledExactlyOnceWith(
    new Uint8Array(new TextEncoder().encode("save")),
  );
  expect(result.descriptor).toMatchObject({
    id: "eu4:1:checksum",
    game: "eu4",
    campaignId: "playthrough",
    artifacts: ["observations"],
  });
  expect(result.payload.provinces).toEqual(provinces);
});

it("refuses parser output from another extractor version", async () => {
  mocks.parse.mockReturnValue({ observation: observation(2), provinces: {} });
  await expect(parseImport(new File(["save"], "test.eu4"))).rejects.toThrow("extractor version 2");
});
