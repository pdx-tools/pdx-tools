import { afterEach, expect, it, vi } from "vitest";
import { cachedPlayback } from "./playbackCache";
import { compressPlayback, playbackCodec } from "./playbackCompression";

afterEach(() => vi.unstubAllGlobals());

function entry(record: object) {
  const close = vi.fn();
  const put = vi.fn();
  const db = {
    close,
    transaction: () => {
      const tx = {
        oncomplete: undefined as (() => void) | undefined,
        objectStore: () => ({
          put,
          get: () => {
            const request = { result: record, onsuccess: undefined as (() => void) | undefined };
            queueMicrotask(() => {
              request.onsuccess?.();
              tx.oncomplete?.();
            });
            return request;
          },
        }),
      };
      return tx;
    },
  };
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = { result: db, onsuccess: undefined as (() => void) | undefined };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return { close, put };
}

it("reads existing gzip and uncompressed entries", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  entry({ blob: new Blob([bytes]), compressed: false });
  expect(new Uint8Array((await cachedPlayback("raw"))!)).toEqual(bytes);
  const gzip = await new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
  ).blob();
  const { close, put } = entry({ blob: gzip, compressed: true });
  expect(new Uint8Array((await cachedPlayback("gzip"))!)).toEqual(bytes);
  expect(close).toHaveBeenCalledOnce();
  expect(put).toHaveBeenCalledWith(
    expect.objectContaining({ compressed: true, accessed: expect.any(Number) }),
  );
});

it("reads chunked Zstandard entries and rejects unknown codecs", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  entry({ blob: await compressPlayback(bytes), codec: playbackCodec, rawSize: bytes.length });
  expect(new Uint8Array((await cachedPlayback("zstd"))!)).toEqual(bytes);
  entry({ blob: new Blob([bytes]), codec: "unsupported" });
  await expect(cachedPlayback("unknown")).rejects.toThrow("Unsupported");
});
