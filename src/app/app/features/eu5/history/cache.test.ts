import { afterEach, expect, it, vi } from "vitest";
import { cachedSnapshots } from "./cache";

afterEach(() => vi.unstubAllGlobals());

it("shares concurrent cache reads and loads current observations through a cursor", async () => {
  const records = [
    { schemaVersion: 2, hash: "obsolete" },
    { schemaVersion: 3, hash: "current" },
  ];
  const openCursor = vi.fn(() => {
    let index = 0;
    const request = {
      result: null as { value: object; continue: () => void } | null,
      onsuccess: undefined as (() => void) | undefined,
    };
    const advance = () =>
      queueMicrotask(() => {
        request.result =
          index < records.length ? { value: records[index++], continue: advance } : null;
        request.onsuccess?.();
      });
    advance();
    return request;
  });
  const close = vi.fn();
  const db = {
    transaction: () => ({ objectStore: () => ({ openCursor }) }),
    close,
  };
  const open = vi.fn(() => {
    const request = { result: db, onsuccess: undefined as (() => void) | undefined };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  });
  vi.stubGlobal("indexedDB", { open });
  const first = cachedSnapshots();
  const second = cachedSnapshots();
  expect(first).toBe(second);
  expect(await first).toEqual([records[1]]);
  expect(open).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  await cachedSnapshots();
  expect(open).toHaveBeenCalledTimes(2);
});
