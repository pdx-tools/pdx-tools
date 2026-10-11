import type { Snapshot } from "./types";

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pdx-eu5-snapshots", 4);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("snapshots"))
        request.result.createObjectStore("snapshots", { keyPath: "hash" });
      // Preserve existing observations. BLAKE3 aliases point to verified SHA records.
      if (!request.result.objectStoreNames.contains("aliases"))
        request.result.createObjectStore("aliases", { keyPath: "hash" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cachedSnapshots(): Promise<Snapshot[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("snapshots").objectStore("snapshots").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function cacheSnapshots(snapshots: Snapshot[]): Promise<void> {
  if (!snapshots.length) return;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("snapshots", "readwrite");
      for (const snapshot of snapshots) tx.objectStore("snapshots").put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function cacheSnapshot(snapshot: Snapshot): Promise<void> {
  return cacheSnapshots([snapshot]);
}

export async function cacheHashAlias(hash: string, target: string): Promise<void> {
  if (!/^blake3:[0-9a-f]{64}$/.test(hash) || !/^[0-9a-f]{64}$/.test(target))
    throw Error("Invalid BLAKE3/SHA cache alias");
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("aliases", "readwrite");
      tx.objectStore("aliases").put({ hash, target });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function cachedHashAlias(hash: string): Promise<string | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("aliases").objectStore("aliases").get(hash);
      request.onsuccess = () => resolve(request.result?.target);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function cachedSnapshot(hash: string): Promise<Snapshot | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["snapshots", "aliases"]);
      const store = tx.objectStore("snapshots");
      const accept = (value: Snapshot | undefined) =>
        resolve(value?.schemaVersion === 3 ? value : undefined);
      const request = store.get(hash);
      request.onsuccess = () => {
        if (request.result) {
          accept(request.result);
          return;
        }
        const alias = tx.objectStore("aliases").get(hash);
        alias.onsuccess = () => {
          if (!alias.result) {
            resolve(undefined);
            return;
          }
          const canonical = store.get(alias.result.target);
          canonical.onsuccess = () => accept(canonical.result);
          canonical.onerror = () => reject(canonical.error);
        };
        alias.onerror = () => reject(alias.error);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function clearSnapshotCache(): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["snapshots", "aliases"], "readwrite");
      tx.objectStore("snapshots").clear();
      tx.objectStore("aliases").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
