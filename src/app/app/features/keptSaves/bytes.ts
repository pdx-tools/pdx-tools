/** The bytes of the kept saves, each in a file of the origin private file system. */
export type KeptBytes = {
  write(hash: string, data: Uint8Array<ArrayBuffer>): Promise<{ modified: number }>;
  /** Null when the browser no longer has the file. */
  size(hash: string): Promise<number | null>;
  remove(hash: string): Promise<void>;
  list(): Promise<string[]>;
};

async function directory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("kept", { create: true });
}

export function isDomException(error: unknown, name: string): boolean {
  return error instanceof DOMException && error.name === name;
}

const ignoreMissing = (error: unknown) => {
  if (!isDomException(error, "NotFoundError")) throw error;
};

export async function keptHandle(hash: string): Promise<FileSystemFileHandle | null> {
  try {
    return await (await directory()).getFileHandle(hash);
  } catch (error) {
    ignoreMissing(error);
    return null;
  }
}

export const keptBytes: KeptBytes = {
  async write(hash, data) {
    const handle = await (await directory()).getFileHandle(hash, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(data);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      await keptBytes.remove(hash);
      throw error;
    }
    return { modified: (await handle.getFile()).lastModified };
  },
  size: async (hash) => (await keptFile(hash))?.size ?? null,
  remove: async (hash) => (await directory()).removeEntry(hash).catch(ignoreMissing),
  async list() {
    const names: string[] = [];
    for await (const name of (await directory()).keys()) names.push(name);
    return names;
  },
};

/** The bytes of a kept save. Null when the browser no longer has them. */
export async function keptFile(hash: string): Promise<File | null> {
  return (await (await keptHandle(hash))?.getFile()) ?? null;
}
