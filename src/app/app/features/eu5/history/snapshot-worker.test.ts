import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./types";

const mocks = vi.hoisted(() => ({
  cachedSnapshot: vi.fn(),
  init: vi.fn(),
  parse: vi.fn(),
  playback: vi.fn(),
  hasPlaybackCache: vi.fn(),
  cachePlayback: vi.fn(),
}));
vi.mock("./playbackCache", () => ({
  hasPlaybackCache: mocks.hasPlaybackCache,
  cachePlayback: mocks.cachePlayback,
}));
vi.mock("comlink", () => ({ expose: vi.fn() }));
vi.mock("./cache", () => ({ cachedSnapshot: mocks.cachedSnapshot }));
vi.mock("@/wasm/wasm_eu5", () => ({
  default: vi.fn(),
  set_tokens: vi.fn(),
  Eu5MetaParser: {
    create: () => ({
      init: mocks.init,
    }),
  },
}));
import { parseSnapshot, sha256File, preparePlaybackCache } from "./snapshot-worker";

const transferDescriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "transfer");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cachedSnapshot.mockResolvedValue(undefined);
  Object.defineProperty(ArrayBuffer.prototype, "transfer", {
    configurable: true,
    value: undefined,
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array())));
  mocks.init.mockReturnValue({
    meta: () => ({ playthroughId: "campaign" }),
    parse_snapshot: mocks.parse,
    playback_cache: mocks.playback,
  });
  mocks.parse.mockReturnValue({ schemaVersion: 3, markets: [] });
});

afterEach(() => {
  if (transferDescriptor) {
    Object.defineProperty(ArrayBuffer.prototype, "transfer", transferDescriptor);
  } else {
    Reflect.deleteProperty(ArrayBuffer.prototype, "transfer");
  }
  vi.unstubAllGlobals();
});

describe("snapshot imports without ArrayBuffer.transfer", () => {
  it("parses a save and releases its source buffer using structuredClone", async () => {
    const bytes = new ArrayBuffer(4);
    const file = { name: "save.eu5", arrayBuffer: async () => bytes } as File;
    const result = await parseSnapshot(file);
    expect(result.cacheHit).toBe(false);
    expect(result.snapshot.fileName).toBe("save.eu5");
    expect(mocks.parse).toHaveBeenCalledOnce();
    expect(bytes.byteLength).toBe(0);
  });

  it("returns a cached observation without invoking the parser", async () => {
    mocks.cachedSnapshot.mockResolvedValue({
      schemaVersion: 3,
      markets: [],
    } as unknown as Snapshot);
    const result = await parseSnapshot(new File(["save"], "cached.eu5"));
    expect(result.cacheHit).toBe(true);
    expect(result.snapshot.fileName).toBe("cached.eu5");
    expect(mocks.init).not.toHaveBeenCalled();
  });

  it("can parse and verify SHA identities without either buffer release API", async () => {
    vi.stubGlobal("structuredClone", undefined);
    const file = new File(["save"], "save.eu5");
    const hash = await sha256File(file);
    const result = await parseSnapshot(file);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.snapshot.hash).toBe(hash);
    expect(mocks.parse).toHaveBeenCalledOnce();
  });
});

it("builds a playback recording once and releases buffers after persistence", async () => {
  mocks.hasPlaybackCache.mockResolvedValue(false);
  const bytes = new ArrayBuffer(4);
  const recording = new Uint8Array([1, 2, 3]);
  mocks.playback.mockReturnValue(recording);
  mocks.cachePlayback.mockResolvedValue(undefined);
  const file = { arrayBuffer: async () => bytes } as File;
  await preparePlaybackCache(file, "verified-hash");
  expect(mocks.cachePlayback.mock.calls[0][0]).toBe("verified-hash");
  expect(mocks.cachePlayback.mock.calls[0][1]).toBe(recording);
  expect(bytes.byteLength).toBe(0);
  expect(recording.byteLength).toBe(0);
  mocks.hasPlaybackCache.mockResolvedValue(true);
  await preparePlaybackCache(file, "verified-hash");
  expect(mocks.playback).toHaveBeenCalledOnce();
});
