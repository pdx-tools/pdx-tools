import { describe, expect, it } from "vitest";
import { ChunkReader, ChunkWriter, createChunkRing } from "./ring";

function readAll(reader: ChunkReader, bufLen: number) {
  const out: number[] = [];
  const buf = new Uint8Array(bufLen);
  for (let n = reader.read(buf); n > 0; n = reader.read(buf)) {
    out.push(...buf.subarray(0, n));
  }
  return out;
}

describe("chunk ring", () => {
  it("splits writes into slots and joins them on read", () => {
    const ring = createChunkRing(8, 4);
    const writer = new ChunkWriter(ring);
    const reader = new ChunkReader(ring);
    writer.write(Uint8Array.of(1, 2, 3, 4, 5, 6));
    writer.write(Uint8Array.of(7));
    writer.close();

    expect(readAll(reader, 3)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(reader.read(new Uint8Array(3))).toBe(0);
  });

  it("reuses slots after the reader releases them", () => {
    const ring = createChunkRing(2, 2);
    const writer = new ChunkWriter(ring);
    const reader = new ChunkReader(ring);
    const out: number[] = [];
    const buf = new Uint8Array(2);
    for (let i = 0; i < 5; i++) {
      writer.write(Uint8Array.of(i, i));
      const n = reader.read(buf);
      out.push(...buf.subarray(0, n));
    }
    writer.close();

    expect([...out, ...readAll(reader, 2)]).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("throws the writer's error on every later read", () => {
    const ring = createChunkRing(4, 32);
    const writer = new ChunkWriter(ring);
    const reader = new ChunkReader(ring);
    writer.write(Uint8Array.of(1));
    writer.fail("bad deflate stream");

    const buf = new Uint8Array(4);
    expect(reader.read(buf)).toBe(1);
    expect(() => reader.read(buf)).toThrow("bad deflate stream");
    expect(() => reader.read(buf)).toThrow("bad deflate stream");
  });

  it("stops waiting for a writer that never writes", () => {
    const reader = new ChunkReader(createChunkRing(), 10);
    expect(() => reader.read(new Uint8Array(1))).toThrow("Timed out");
  });
});
