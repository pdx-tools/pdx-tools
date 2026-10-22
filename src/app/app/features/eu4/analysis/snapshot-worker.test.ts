import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  init: vi.fn(),
  tokens: vi.fn(),
  transfer: vi.fn(),
}));
vi.mock("comlink", () => ({ expose: vi.fn(), transfer: mocks.transfer }));
vi.mock("@sentry/react-router", () => ({ registerWebWorker: vi.fn() }));
vi.mock("@/wasm/wasm_eu4", () => ({
  default: mocks.init,
  set_tokens: mocks.tokens,
  parse_analysis: mocks.parse,
}));
import { parseImport } from "./snapshot-worker";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transfer.mockImplementation((value: unknown) => value);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1]))));
});
afterEach(() => vi.unstubAllGlobals());

it("gives the snapshot of the parser to the session and transfers its bytes", async () => {
  const snapshot = { descriptor: { id: "eu4:1:checksum" }, data: new Uint8Array([1, 2]) };
  mocks.parse.mockReturnValue(snapshot);
  const result = await parseImport(new File(["save"], "test.eu4"));
  expect(mocks.parse).toHaveBeenCalledExactlyOnceWith(
    new Uint8Array(new TextEncoder().encode("save")),
  );
  expect(result).toBe(snapshot);
  expect(mocks.transfer).toHaveBeenCalledWith(snapshot, [snapshot.data.buffer]);
});
