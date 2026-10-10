import { expose } from "comlink";
import init, { set_tokens, Eu5MetaParser } from "@/wasm/wasm_eu5";
import wasmUrl from "@/wasm/wasm_eu5_bg.wasm?url";
import tokenUrl from "../../../../../../assets/tokens/eu5.bin?url";
import type { Snapshot } from "./types";
import { cachedSnapshot } from "./cache";

// This module runs in a dedicated worker; the app's shared TS config uses DOM types.
declare const FileReaderSync: { new (): { readAsArrayBuffer(blob: Blob): ArrayBuffer } };

let ready: Promise<void> | undefined;
const initialize = () =>
  (ready ??= (async () => {
    await init({ module_or_path: wasmUrl });
    const response = await fetch(tokenUrl);
    if (!response.ok) throw new Error("Could not load EU5 parser tokens");
    set_tokens(new Uint8Array(await response.arrayBuffer()));
  })());

/** Only used to verify an existing SHA cache identity during BLAKE3 migration. */
export async function sha256File(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  // Release the large backing store immediately, before another migration job starts.
  bytes.transfer(0);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verify a BLAKE3 identity when streaming is unavailable in the current context. */
export async function blake3File(file: File): Promise<string> {
  const module = await import("../../../../../../dev/eu5-streaming/pkg-blake3/eu5_streaming.js");
  await module.default();
  const reader = new FileReaderSync();
  let chunk: ArrayBuffer | undefined;
  try {
    const result = module.stream_snapshot(
      (offset: number, length: number) => {
        chunk?.transfer(0);
        const bytes = reader.readAsArrayBuffer(file.slice(offset, offset + length));
        chunk = bytes;
        return new Uint8Array(bytes);
      },
      8 * 1024 * 1024,
      true,
      true,
    );
    if (result.bytesRead !== file.size || !result.hash) throw Error("Incomplete save verification");
    return `blake3:${result.hash}`;
  } finally {
    chunk?.transfer(0);
  }
}

export async function parseSnapshot(
  file: File,
): Promise<{ snapshot: Snapshot; cacheHit: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const cached = await cachedSnapshot(hash).catch(() => undefined);
  if (cached) {
    bytes.buffer.transfer(0);
    return { snapshot: { ...cached, fileName: file.name }, cacheHit: true };
  }
  await initialize();
  const parser = Eu5MetaParser.create().init(bytes);
  bytes.buffer.transfer(0);
  const metadata = parser.meta();
  if (!metadata.playthroughId) {
    parser.free();
    throw new Error("Save has no campaign ID; it cannot be safely joined to a timeline");
  }
  const snapshot = parser.parse_snapshot();
  const marketLabels: Record<string, string> = {};
  for (const market of snapshot.markets) {
    if (market.centerName) marketLabels[market.center] = market.centerName.replaceAll("_", " ");
  }
  return { snapshot: { ...snapshot, hash, fileName: file.name, marketLabels }, cacheHit: false };
}

expose({ parseSnapshot, sha256File, blake3File });
