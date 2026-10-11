import { expect, it } from "vitest";
import { compressPlayback, decompressPlayback } from "./playbackCompression";

it("round trips multiple Zstandard frames and a final partial frame", async () => {
  const bytes = new Uint8Array(4 * 1024 ** 2 + 257);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  const blob = await compressPlayback(bytes);
  expect(new Uint8Array(await decompressPlayback(blob, bytes.length))).toEqual(bytes);
});

it("rejects truncated, oversized, and trailing frames", async () => {
  const bytes = new Uint8Array(257);
  const blob = await compressPlayback(bytes);
  await expect(decompressPlayback(blob.slice(0, blob.size - 1), bytes.length)).rejects.toThrow(
    "length",
  );
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, 0xffffffff, true);
  await expect(decompressPlayback(new Blob([length, blob.slice(4)]), bytes.length)).rejects.toThrow(
    "length",
  );
  await expect(
    decompressPlayback(new Blob([blob, new Uint8Array(1)]), bytes.length),
  ).rejects.toThrow("Trailing");
  await expect(decompressPlayback(blob, NaN)).rejects.toThrow("recording size");
});

it("rejects frame metadata mismatches before asking the codec to allocate output", async () => {
  const blob = await compressPlayback(new Uint8Array(257));
  await expect(decompressPlayback(blob, 258)).rejects.toThrow("size mismatch");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  bytes[8] |= 1; // Dictionary flag: our recordings never use dictionaries.
  await expect(decompressPlayback(new Blob([bytes]), 257)).rejects.toThrow("compression frame");
});
