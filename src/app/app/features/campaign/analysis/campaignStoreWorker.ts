import { indexContent, pickIndex, sealIndex } from "./campaignStore";
import type {
  IndexPoint,
  CampaignIndexContent,
  PersistReply,
  PersistRequest,
  RestoreReply,
} from "./campaignStore";
import { MEMORY_LIMIT_ERROR, STALE_GENERATION_ERROR } from "./session";
import type { AnalysisStore, DescriptorOf, ResidentMemory } from "./session";

/** What the worker knows of a campaign's kept points since it read them. */
type Loaded = {
  /** A failed load is never written over. */
  readOnly: boolean;
  writeSeq: number;
  content: CampaignIndexContent | null;
  /** Kept points that the load could not add, which keep their place until forgotten. */
  absent: Set<string>;
  /** The absent points whose figures could not be read, not those the bound left out. */
  unread: Set<string>;
  /** The content last written, to skip a write that changes nothing. */
  written: string;
};

const INDEX_FILES = ["index-a.json", "index-b.json"] as const;

/** A figures file to write, gzipped. */
type SnapWrite = { id: string; file: string; gz: Uint8Array<ArrayBuffer> };

async function campaignDir(campaignId: string, create: boolean) {
  const root = await navigator.storage.getDirectory();
  const campaigns = await root.getDirectoryHandle("campaigns", { create });
  return campaigns.getDirectoryHandle(encodeURIComponent(campaignId), { create });
}

async function readFile(dir: FileSystemDirectoryHandle, name: string) {
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
}

/** The synchronous file access that only a worker has. */
type SyncAccessHandle = {
  truncate(size: number): void;
  write(bytes: Uint8Array, options: { at: number }): number;
  flush(): void;
  close(): void;
};

/** Write a whole file through a synchronous handle. */
async function writeFile(dir: FileSystemDirectoryHandle, name: string, bytes: Uint8Array) {
  const file = (await dir.getFileHandle(name, { create: true })) as FileSystemFileHandle & {
    createSyncAccessHandle(): Promise<SyncAccessHandle>;
  };
  const handle = await file.createSyncAccessHandle();
  try {
    handle.truncate(0);
    handle.write(bytes, { at: 0 });
    handle.flush();
  } finally {
    handle.close();
  }
}

const gzip = (bytes: Uint8Array<ArrayBuffer>, format: "compress" | "decompress") =>
  new Response(
    new Blob([bytes])
      .stream()
      .pipeThrough(
        format === "compress" ? new CompressionStream("gzip") : new DecompressionStream("gzip"),
      ),
  ).arrayBuffer();

/**
 * The kept points of a campaign in this browser's private files. The
 * analysis worker reads and writes them, since it holds the figures.
 */
export function campaignStoreApi<S extends AnalysisStore>(opened: Promise<S>, game: string) {
  /** The one campaign that this tab keeps, since it read its index. */
  let loaded: (Loaded & { campaignId: string }) | null = null;

  // One call at a time, so a write never lands after a forget or a new restore.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run);
    queue = next.catch(() => {});
    return next;
  };

  async function readIndex(dir: FileSystemDirectoryHandle | null) {
    const copies = dir ? await Promise.all(INDEX_FILES.map((name) => readFile(dir, name))) : [];
    // An empty copy is one whose write never happened, such as a refused first write.
    const texts = copies.map((x) => (x?.byteLength ? new TextDecoder().decode(x) : null));
    const index = await pickIndex(texts);
    return { index, unreadable: !index && texts.some((x) => x !== null) };
  }

  const fresh = (readOnly: boolean): Loaded => ({
    readOnly,
    writeSeq: 0,
    content: null,
    written: "",
    absent: new Set(),
    unread: new Set(),
  });

  /**
   * Read the campaign's index. Only a missing folder means that nothing is
   * kept; any other failure is a failed load, which is never written over.
   */
  async function load(campaignId: string) {
    let dir: FileSystemDirectoryHandle | null = null;
    let index = null;
    try {
      dir = await campaignDir(campaignId, false).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "NotFoundError") return null;
        throw error;
      });
      const read = await readIndex(dir);
      if (read.unreadable) throw Error("No copy of the index is valid");
      index = read.index;
    } catch {
      loaded = { campaignId, ...fresh(true) };
      return { state: loaded, dir: null, content: null };
    }
    const content = index && indexContent(index);
    loaded = {
      campaignId,
      ...fresh(false),
      writeSeq: index?.writeSeq ?? 0,
      content,
      written: content ? JSON.stringify(content) : "",
    };
    return { state: loaded, dir, content };
  }

  const restore = (generation: number, campaignId: string, limitBytes: number) =>
    serial(async (): Promise<RestoreReply<DescriptorOf<S>> & { memory: ResidentMemory }> => {
      const store = await opened;
      const { state, dir, content } = await load(campaignId);
      if (!content) {
        return { status: state.readOnly ? "unreadable" : "none", memory: store.memory() };
      }
      const snapDir = await dir!.getDirectoryHandle("snap").catch(() => null);
      const descriptors: DescriptorOf<S>[] = [];
      const missing: string[] = [];
      let full = false;
      for (const point of content.points) {
        const data =
          point.snapshot && snapDir && !full ? await readFile(snapDir, point.snapshot.file) : null;
        if (!data) {
          state.absent.add(point.id);
          if (!full) {
            missing.push(point.id);
            state.unread.add(point.id);
          }
          continue;
        }
        try {
          const bytes = new Uint8Array(await gzip(data, "decompress"));
          const { descriptor } = store.append(generation, bytes, limitBytes);
          descriptors.push(descriptor as DescriptorOf<S>);
        } catch (error) {
          const name = error instanceof Error ? error.name : "";
          if (name === STALE_GENERATION_ERROR) throw error;
          state.absent.add(point.id);
          if (name === MEMORY_LIMIT_ERROR) full = true;
          else {
            missing.push(point.id);
            state.unread.add(point.id);
          }
        }
      }
      return { status: "ok", content, descriptors, missing, full, memory: store.memory() };
    });

  const persist = (campaignId: string, request: PersistRequest, limitBytes: number) =>
    serial(async (): Promise<PersistReply> => {
      // A campaign that nothing was restored into: its kept points stay as they are.
      if (loaded?.campaignId !== campaignId) {
        const { state, content } = await load(campaignId);
        for (const point of content?.points ?? []) state.absent.add(point.id);
      }
      const state = loaded!;
      if (state.readOnly) return { status: "readOnly" };
      const store = await opened;
      const ours = new Map((state.content?.points ?? []).map((x) => [x.id, x]));
      const asked = new Set(request.points.map((x) => x.id));
      // A point that the old index holds keeps its place, and its order, until it is forgotten.
      const entries = new Map<string, IndexPoint>();
      for (const x of ours.values())
        if (state.absent.has(x.id) || asked.has(x.id)) entries.set(x.id, x);
      // Only figures that could not be read are written again; a file the bound left out is fine.
      const known = (id: string) =>
        state.unread.has(id) ? null : (ours.get(id)?.snapshot ?? null);
      // Kept points always stay; the bound only stops new ones, oldest seen first.
      for (const point of request.points) {
        const snapshot = known(point.id);
        if (snapshot) entries.set(point.id, { ...point, snapshot, saveFile: null });
      }
      let total = [...entries.values()].reduce((sum, x) => sum + (x.snapshot?.bytes ?? 0), 0);
      const writes: SnapWrite[] = [];
      let full = false;
      // The browser's quota, checked once: new points are compressed one at a
      // time against it, and the first that doesn't fit stops the rest.
      const estimate = await navigator.storage.estimate();
      let room = (estimate.quota ?? 0) - (estimate.usage ?? 0);
      const read = (id: string) => {
        try {
          return store.snapshot(id).data;
        } catch {
          return null;
        }
      };
      const figures = async (id: string, data: Uint8Array<ArrayBuffer>) => {
        const gz = new Uint8Array(await gzip(data, "compress"));
        const snapshot = {
          file: `${encodeURIComponent(id)}.gz`,
          encoder: store.encoder(),
          bytes: data.byteLength,
        };
        return { gz, snapshot };
      };
      // A kept point that could not be read, dropped again: its figures are written anew.
      for (const point of request.points) {
        const old = ours.get(point.id);
        if (!old || !state.unread.has(point.id)) continue;
        const data = read(point.id);
        if (!data) continue;
        const made = await figures(point.id, data);
        if (made.gz.byteLength > room) {
          full = true;
          continue;
        }
        room -= made.gz.byteLength;
        total += made.snapshot.bytes - (old.snapshot?.bytes ?? 0);
        writes.push({ id: point.id, file: made.snapshot.file, gz: made.gz });
        entries.set(point.id, { ...point, snapshot: made.snapshot, saveFile: null });
      }
      for (const point of [...request.points].sort((a, b) => a.seq - b.seq)) {
        if (entries.has(point.id)) continue;
        const data = read(point.id);
        if (!data) continue;
        if (total + data.byteLength > limitBytes) {
          full = true;
          break;
        }
        const made = await figures(point.id, data);
        if (made.gz.byteLength > room) {
          full = true;
          break;
        }
        room -= made.gz.byteLength;
        total += data.byteLength;
        writes.push({ id: point.id, file: made.snapshot.file, gz: made.gz });
        entries.set(point.id, { ...point, snapshot: made.snapshot, saveFile: null });
      }
      const points = [...entries.values()];
      return finish(points, writes, full);

      async function finish(points: IndexPoint[], writes: SnapWrite[], full: boolean) {
        const content: CampaignIndexContent = {
          format: 1,
          game,
          playthroughId: campaignId,
          keepFiles: false,
          nextSeq: request.nextSeq,
          // Runs of kept points that the load could not add stay with them.
          sessions: [
            ...request.sessions,
            ...(state.content?.sessions ?? []).filter(
              (x) =>
                !request.sessions.some((y) => y.id === x.id) &&
                points.some((p) => p.session === x.id),
            ),
          ],
          points,
        };
        const text = JSON.stringify(content);
        const missing = state.unread.size;
        // No folder until there is a point to keep.
        if (text === state.written || (!state.content && !points.length))
          return {
            status: full ? "full" : "unchanged",
            kept: points.length,
            ids: points.map((x) => x.id),
            missing,
          } as const;
        const dir = await campaignDir(campaignId, true);
        const snapDir = await dir.getDirectoryHandle("snap", { create: true });
        const writeSeq = state.writeSeq + 1;
        const started: string[] = [];
        try {
          // The figures go first, so an index never names a file that is not there.
          for (const { file, gz } of writes) {
            started.push(file);
            await writeFile(snapDir, file, gz);
          }
          const index = await sealIndex(content, writeSeq);
          // The older copy is written, so the last index stays whole if this fails.
          await writeFile(
            dir,
            INDEX_FILES[writeSeq % 2],
            new TextEncoder().encode(JSON.stringify(index)),
          );
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "QuotaExceededError")) throw error;
          // The estimate was wrong: the last index stands, without this call's files.
          for (const file of started) await snapDir.removeEntry(file).catch(() => {});
          if (!state.content) await dir.removeEntry(INDEX_FILES[writeSeq % 2]).catch(() => {});
          const last = state.content?.points ?? [];
          return {
            status: "full",
            kept: last.length,
            ids: last.map((x) => x.id),
            missing: state.unread.size,
          } as const;
        }
        for (const { id } of writes) {
          state.absent.delete(id);
          state.unread.delete(id);
        }
        const named = new Set(points.map((x) => x.snapshot?.file));
        for (const point of ours.values())
          if (point.snapshot && !named.has(point.snapshot.file))
            await snapDir.removeEntry(point.snapshot.file).catch(() => {});
        Object.assign(state, { writeSeq, content, written: text });
        return {
          status: full ? "full" : "written",
          kept: points.length,
          ids: points.map((x) => x.id),
          missing: state.unread.size,
        } as const;
      }
    });

  /** Remove everything this browser keeps of the campaign. */
  const forget = (campaignId: string) =>
    serial(async () => {
      const root = await navigator.storage.getDirectory();
      const campaigns = await root.getDirectoryHandle("campaigns", { create: true });
      await campaigns
        .removeEntry(encodeURIComponent(campaignId), { recursive: true })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
        });
      loaded = { campaignId, ...fresh(false) };
    });

  return { restore, persist, forget };
}

export type CampaignStoreApi = ReturnType<typeof campaignStoreApi>;
