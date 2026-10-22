import { afterEach, expect, it } from "vitest";
import { FrameReader, serveFrames } from "./framePort";

type Frame = { snapshotId: string; ids: Uint32Array<ArrayBuffer> };
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
it("transfers the copy that the lookup gives", async () => {
  const copies: Uint32Array<ArrayBuffer>[] = [];
  const channel = new MessageChannel();
  const serve = serveFrames<Frame>(channel.port1, (snapshotId) => {
    const ids = new Uint32Array([42, 73]);
    copies.push(ids);
    return { snapshotId, ids };
  });
  const reader = new FrameReader<Frame>(channel.port2);
  cleanup.push(serve, () => reader.close());
  const first = await reader.read("save");
  expect([...first.ids]).toEqual([42, 73]);
  // The reply transferred the copy, so the analysis worker keeps nothing.
  expect(copies[0].byteLength).toBe(0);
  expect((await reader.read("save")).ids[0]).toBe(42);
});
it("reports a missing frame and keeps the connection usable", async () => {
  const channel = new MessageChannel();
  const serve = serveFrames(channel.port1, (snapshotId) => {
    if (snapshotId === "missing") throw Error("Missing observation");
    return { snapshotId };
  });
  const reader = new FrameReader<{ snapshotId: string }>(channel.port2);
  cleanup.push(serve, () => reader.close());
  await expect(reader.read("missing")).rejects.toThrow("Missing observation");
  await expect(reader.read("present")).resolves.toMatchObject({ snapshotId: "present" });
});
it("rejects in-flight requests when the storage connection closes", async () => {
  const channel = new MessageChannel();
  const reader = new FrameReader(channel.port2);
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
