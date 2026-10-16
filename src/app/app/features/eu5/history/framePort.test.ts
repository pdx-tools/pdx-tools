import { afterEach, expect, it } from "vitest";
import { MapFrameReader, serveMapFrames } from "./framePort";
import type { MapFrame } from "./analysisTypes";
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
it("transfers a frame copy directly without detaching resident columns", async () => {
  const original = new Uint32Array([42, 73]);
  const channel = new MessageChannel();
  const serve = serveMapFrames(
    channel.port1,
    () => ({ hash: "save", locationIds: original }) as MapFrame,
  );
  const reader = new MapFrameReader(channel.port2);
  cleanup.push(serve, () => reader.close());
  const first = await reader.read("save");
  expect(first.locationIds).toEqual(original);
  first.locationIds[0] = 99;
  expect(original[0]).toBe(42);
  expect(original.byteLength).toBe(8);
  expect((await reader.read("save")).locationIds[0]).toBe(42);
});
it("reports a missing frame and keeps the connection usable", async () => {
  const channel = new MessageChannel();
  const serve = serveMapFrames(channel.port1, (hash) => {
    if (hash === "missing") throw Error("Missing observation");
    return { hash } as MapFrame;
  });
  const reader = new MapFrameReader(channel.port2);
  cleanup.push(serve, () => reader.close());
  await expect(reader.read("missing")).rejects.toThrow("Missing observation");
  await expect(reader.read("present")).resolves.toMatchObject({ hash: "present" });
});
it("rejects in-flight requests when the storage connection closes", async () => {
  const channel = new MessageChannel();
  const reader = new MapFrameReader(channel.port2);
  cleanup.push(
    () => channel.port1.close(),
    () => reader.close(),
  );
  const request = reader.read("save");
  const rejected = expect(request).rejects.toThrow("connection closed");
  channel.port1.postMessage({ closed: true });
  await rejected;
  await expect(reader.read("save")).rejects.toThrow("closed");
});
