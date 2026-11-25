import type { FolderState, KeptSave, KeptSettings, SaveWrite, WatchConfig } from "./types";

/** The stores and the property that is the key of each. */
const KEYS = {
  saves: "hash",
  writes: "hash",
  watches: "game",
  folders: "game",
  settings: "key",
} as const;

type Tables = {
  saves: KeptSave;
  writes: SaveWrite;
  watches: WatchConfig;
  folders: FolderState;
  settings: KeptSettings;
};

type Table = keyof Tables;

type KeptReader = {
  get<T extends Table>(table: T, key: string): Promise<Tables[T] | undefined>;
  all<T extends Table>(table: T): Promise<Tables[T][]>;
};

/** Await only the calls of the transaction inside it, or it ends early. */
export type KeptTransaction = KeptReader & {
  put<T extends Table>(table: T, record: Tables[T]): void;
  remove(table: Table, key: string): void;
};

export type KeptDb = KeptReader & {
  /** Apply every change of `run` or none. The changes are durable on return. */
  transact<R>(run: (transaction: KeptTransaction) => Promise<R>): Promise<R>;
};

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  return (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("kept-saves", 1);
    request.onupgradeneeded = () => {
      for (const [table, keyPath] of Object.entries(KEYS)) {
        request.result.createObjectStore(table, { keyPath });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let a newer version of the page upgrade the database.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    request.onblocked = () =>
      reject(new Error("Kept saves are open in an older tab. Reload the other PDX Tools tabs."));
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    opening = null;
    throw error;
  }));
}

function reader(store: (table: Table) => IDBObjectStore): KeptReader {
  return {
    get: (table, key) => settled(store(table).get(key)),
    all: (table) => settled(store(table).getAll()),
  };
}

async function read(table: Table): Promise<KeptReader> {
  const db = await open();
  return reader(() => db.transaction(table, "readonly").objectStore(table));
}

export const keptDb: KeptDb = {
  get: async (table, key) => (await read(table)).get(table, key),
  all: async (table) => (await read(table)).all(table),
  transact: async (run) => {
    const db = await open();
    const transaction = db.transaction(Object.keys(KEYS), "readwrite", { durability: "strict" });
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    const store = (table: Table) => transaction.objectStore(table);
    try {
      const result = await run({
        ...reader(store),
        put: (table, record) => store(table).put(record),
        remove: (table, key) => store(table).delete(key),
      });
      await done;
      return result;
    } catch (error) {
      // The failure can be the end of the transaction itself.
      if (transaction.error === null) transaction.abort();
      await done.catch(() => {});
      throw error;
    }
  },
};
