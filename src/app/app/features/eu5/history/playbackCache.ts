import wasmUrl from "@/wasm/wasm_eu5_bg.wasm?url";
import { parsedSaveKey } from "../saveCacheKey";
import type { Eu5ParsedSave } from "../store/types";

// Production asset hashes invalidate recordings when the parser changes.
const prefix = `1:${wasmUrl}:`;
const identities = new Map<string, string>();
const budget = 8 * 1024 ** 3;

export function rememberPlaybackIdentity(save: Eu5ParsedSave, hash: string) {
  identities.set(parsedSaveKey(save), hash);
}
export const playbackIdentity = (save: Eu5ParsedSave) => identities.get(parsedSaveKey(save));

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pdx-eu5-playback", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("entries", { keyPath: "key" });
      store.createIndex("accessed", "accessed");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function hasPlaybackCache(hash: string): Promise<boolean> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("entries")
        .objectStore("entries")
        .getKey(prefix + hash);
      request.onsuccess = () => resolve(request.result !== undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function cachedPlayback(hash: string): Promise<ArrayBuffer | undefined> {
  const db = await database();
  try {
    const entry = await new Promise<{ blob: Blob; compressed?: boolean } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction("entries", "readwrite");
        const store = tx.objectStore("entries");
        const request = store.get(prefix + hash);
        let value: { blob: Blob; compressed?: boolean } | undefined;
        request.onsuccess = () => {
          const entry = request.result;
          if (entry) {
            value = { blob: entry.blob, compressed: entry.compressed };
            store.put({ ...entry, accessed: Date.now() });
          }
        };
        tx.oncomplete = () => resolve(value);
        tx.onerror = tx.onabort = () => reject(tx.error);
      },
    );
    if (!entry) return undefined;
    return entry.compressed
      ? new Response(entry.blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
      : entry.blob.arrayBuffer();
  } finally {
    db.close();
  }
}

export async function cachePlayback(hash: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  if (!bytes.byteLength || bytes.byteLength > budget)
    throw Error("Playback recording exceeds cache budget");
  const compressed = typeof CompressionStream !== "undefined";
  const source = new Blob([bytes]);
  const blob = compressed
    ? await new Response(source.stream().pipeThrough(new CompressionStream("gzip"))).blob()
    : source;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("entries", "readwrite");
      const store = tx.objectStore("entries");
      const entries: { key: string; size: number }[] = [];
      let total = blob.size;
      const cursor = store.index("accessed").openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (item) {
          if (item.value.key !== prefix + hash) {
            total += item.value.blob.size;
            entries.push({ key: item.value.key, size: item.value.blob.size });
          }
          item.continue();
          return;
        }
        for (const entry of entries) {
          if (total <= budget) break;
          store.delete(entry.key);
          total -= entry.size;
        }
        store.put({ key: prefix + hash, blob, compressed, accessed: Date.now() });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function deletePlaybackCache(hash?: string): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("entries", "readwrite");
      const store = tx.objectStore("entries");
      if (hash) store.delete(prefix + hash);
      else store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
