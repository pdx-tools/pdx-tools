// Each independent frame limits the codec's working memory to a 4 MiB input.
import type * as Zstd from "@bokuweb/zstd-wasm";
const chunkSize = 4 * 1024 ** 2;
function release(bytes: Uint8Array) {
  const buffer = bytes.buffer as ArrayBuffer;
  if (typeof buffer.transfer === "function") buffer.transfer(0);
  else if (typeof structuredClone === "function") structuredClone(buffer, { transfer: [buffer] });
}
export const playbackCodec = "zstd-chunks-v1";
let ready: Promise<typeof Zstd> | undefined;
const codec = () =>
  (ready ??= import("@bokuweb/zstd-wasm").then(async (module) => {
    await module.init();
    return module;
  }));

export async function compressPlayback(bytes: Uint8Array<ArrayBuffer>): Promise<Blob> {
  const { compress } = await codec();
  const parts: Blob[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const frame = compress(bytes.subarray(offset, offset + chunkSize), 1);
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, frame.length, true);
    // Blob snapshots the frame before the next call reuses the codec heap.
    parts.push(new Blob([length, frame as Uint8Array<ArrayBuffer>]));
    release(frame);
  }
  return new Blob(parts);
}

// Check the frame's declared output size before the package allocates its
// output buffer. Only our dictionary-free frames with a known size are accepted.
function validateFrame(frame: Uint8Array<ArrayBuffer>, expected: number) {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  if (frame.length < 6 || view.getUint32(0, true) !== 0xfd2fb528 || frame[4] & 0x0b)
    throw Error("Invalid playback compression frame");
  const flag = frame[4] >>> 6;
  const single = !!(frame[4] & 0x20);
  const offset = single ? 5 : 6;
  if (!single && 2 ** (10 + (frame[5] >>> 3)) * (1 + (frame[5] & 7) / 8) > chunkSize)
    throw Error("Playback frame window exceeds chunk budget");
  const sizeBytes = flag === 0 ? (single ? 1 : 0) : 2 ** flag;
  if (!sizeBytes || frame.length < offset + sizeBytes) throw Error("Missing playback frame size");
  const size =
    sizeBytes === 1
      ? BigInt(frame[offset])
      : sizeBytes === 2
        ? BigInt(view.getUint16(offset, true) + 256)
        : sizeBytes === 4
          ? BigInt(view.getUint32(offset, true))
          : view.getBigUint64(offset, true);
  if (size !== BigInt(expected)) throw Error("Playback frame size mismatch");
}

export async function decompressPlayback(blob: Blob, rawSize: number): Promise<ArrayBuffer> {
  if (
    !Number.isSafeInteger(rawSize) ||
    rawSize <= 0 ||
    rawSize > 0xffffffff ||
    blob.size < Math.ceil(rawSize / chunkSize) * 10
  )
    throw Error("Invalid playback recording size");
  const { decompress } = await codec();
  const output = new Uint8Array(rawSize);
  let position = 0;
  for (let offset = 0; offset < rawSize; offset += chunkSize) {
    if (position + 4 > blob.size) throw Error("Truncated playback frame");
    const prefix = await blob.slice(position, position + 4).arrayBuffer();
    const length = new DataView(prefix).getUint32(0, true);
    position += 4;
    if (!length || length > chunkSize + 65536 || position + length > blob.size)
      throw Error("Invalid playback frame length");
    const frame = new Uint8Array(await blob.slice(position, position + length).arrayBuffer());
    const expected = Math.min(chunkSize, rawSize - offset);
    validateFrame(frame, expected);
    const decoded = decompress(frame);
    if (decoded.length !== expected) throw Error("Playback frame size mismatch");
    output.set(decoded, offset);
    release(decoded);
    release(frame);
    position += length;
  }
  if (position !== blob.size) throw Error("Trailing playback compression data");
  return output.buffer;
}
