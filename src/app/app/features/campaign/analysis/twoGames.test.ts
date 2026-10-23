import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Eu4Snapshot } from "@/features/eu4/analysis/analysisTypes";
import { importEu4Campaign } from "@/features/eu4/analysis/importCampaign";
import type { Eu5Snapshot } from "@/features/eu5/history/analysisTypes";
import { eu5ParserAdapter } from "@/features/eu5/history/parserAdapter";
import type { Eu4AnalysisStore } from "@/wasm/wasm_eu4";
import type { Eu5AnalysisStore } from "@/wasm/wasm_eu5";
import { analysisAdmission, IMPORT_BUSY_ERROR } from "./admission";
import type { SnapshotDescriptor } from "./descriptor";
import { importBatch } from "./importScheduler";
import { sessionApi } from "./session";
import type { AnalysisStore } from "./session";
import { createAnalysisWorker } from "./workerClient";
import type { AnalysisWorkerClient } from "./workerClient";

// Replace worker transport and the Rust stores. Keep the scheduler, the
// sessions and the clients in use.
const mocks = vi.hoisted(() => ({
  parse: new Map<string, (file: File) => Promise<unknown>>(),
  sessions: new Map<string, unknown>(),
  eu4: null as AnalysisWorkerClient<Eu4AnalysisStore> | null,
}));
vi.mock("@/features/eu4/analysis/analysisClient", () => ({
  get eu4Analysis() {
    return mocks.eu4;
  },
}));
vi.mock("comlink", () => ({
  wrap: (worker: { name: string }) => {
    const parse = mocks.parse.get(worker.name);
    return parse ? { parseImport: parse } : mocks.sessions.get(worker.name);
  },
  transfer: (value: unknown) => value,
}));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: () => () => {} }));

const gameOf = (url: string | URL) =>
  String(url).includes("/eu4/") ? "eu4" : String(url).includes("/eu5/") ? "eu5" : String(url);

const descriptor = (game: string, hash: string, campaignId: string): SnapshotDescriptor => ({
  id: `${game}:1:${hash}`,
  game,
  campaignId,
  contentHash: hash,
  date: "1444-11-11",
  dateSort: 14441111,
  gameVersion: "1.0.0",
  extractorVersion: 1,
  layoutKey: game,
  artifacts: ["observations"],
});

/** The descriptor in each opaque snapshot, as Rust reads it. */
const encoded = new WeakMap<Uint8Array, SnapshotDescriptor>();
function snapshot<S extends Eu4Snapshot | Eu5Snapshot>(descriptor: S["descriptor"]) {
  const data = new Uint8Array(1) as S["data"];
  encoded.set(data, descriptor);
  return { descriptor, data } as S;
}

const eu4Save = (hash: string, campaignId = "eu4-campaign") =>
  snapshot<Eu4Snapshot>({ ...descriptor("eu4", hash, campaignId), game: "eu4" });

const eu5Save = (hash: string) =>
  snapshot<Eu5Snapshot>({
    ...descriptor("eu5", hash, "eu5-campaign"),
    game: "eu5",
    world: { locationCount: 1, countryCount: 1, totalPopulation: 1 },
  });

/** Keeps the descriptors of one campaign, as the Rust store does. */
function fakeStore(): AnalysisStore {
  const rows: SnapshotDescriptor[] = [];
  const memory = () => ({
    bufferBytes: rows.length,
    allocatedBytes: rows.length,
    allocatedColumnBytes: rows.length,
    allocatedKeyBytes: 0,
    snapshots: rows.length,
    layouts: 0,
    indexBytes: 0,
    wasmBytes: 0,
  });
  return {
    open: () => {},
    append: (_generation, data: Uint8Array) => {
      const row = encoded.get(data)!;
      rows.push(row);
      return { descriptor: row, duplicate: false, memory: memory() };
    },
    clear: () => {
      rows.splice(0);
      return memory();
    },
    query: () => ({ generation: 0, snapshotIds: [], outcome: { status: "stale" } }),
    snapshot: () => {
      throw Error("No snapshot");
    },
    memory,
  };
}

function clients() {
  mocks.sessions.set("eu4-analysis", sessionApi(Promise.resolve(fakeStore())));
  mocks.sessions.set("eu5-analysis", sessionApi(Promise.resolve(fakeStore())));
  const options = (session: string) => ({
    session,
    start: () => new Worker(`${session}-analysis`),
    onFailure: () => {},
  });
  const result = {
    eu4: createAnalysisWorker<Eu4AnalysisStore>(options("eu4")),
    eu5: createAnalysisWorker<Eu5AnalysisStore>(options("eu5")),
  };
  mocks.eu4 = result.eu4;
  return result;
}

beforeEach(() => {
  mocks.parse.clear();
  mocks.sessions.clear();
  vi.stubGlobal(
    "Worker",
    class extends EventTarget {
      name: string;
      terminate = vi.fn();
      constructor(url: string | URL) {
        super();
        this.name = String(url).endsWith("-analysis") ? String(url) : gameOf(url);
      }
    },
  );
});
afterEach(async () => {
  await mocks.eu4?.clear();
  mocks.eu4 = null;
  vi.unstubAllGlobals();
});

it("refuses an import of one game while an import of the other game runs", async () => {
  const admission = analysisAdmission();
  const { eu5 } = clients();
  const { promise: parsed, resolve } = Promise.withResolvers<unknown>();
  mocks.parse.set("eu5", () => parsed);
  mocks.parse.set("eu4", async () => eu4Save("a"));

  const lease = admission.acquireImport();
  const running = importBatch([new File(["save"], "a.eu5")], eu5ParserAdapter, eu5, {
    signal: new AbortController().signal,
    lease,
    onFileComplete: () => {},
  });
  await expect(
    importEu4Campaign([new File(["save"], "a.eu4")], "eu4-campaign"),
  ).rejects.toMatchObject({ name: IMPORT_BUSY_ERROR });
  resolve(eu5Save("a"));
  expect((await running).outcomes.accepted).toBe(1);
  lease.release();

  const result = await importEu4Campaign([new File(["save"], "a.eu4")], "eu4-campaign");
  expect(result.outcomes.accepted).toBe(1);
});

it("releases the session of the other game when an import starts", async () => {
  const admission = analysisAdmission();
  const { eu5 } = clients();
  mocks.parse.set("eu5", async () => eu5Save("a"));
  const lease = admission.acquireImport();
  try {
    await importBatch([new File(["save"], "a.eu5")], eu5ParserAdapter, eu5, {
      signal: new AbortController().signal,
      lease,
      onFileComplete: () => {},
    });
  } finally {
    lease.release();
  }
  expect(admission.residentBytes()).toBe(1);
  const eu5Generation = eu5.generation();

  mocks.parse.set("eu4", async () => eu4Save("a"));
  await importEu4Campaign([new File(["save"], "a.eu4")], "eu4-campaign");
  // Only the EU4 session keeps data now.
  expect(eu5.generation()).toBeGreaterThan(eu5Generation);
  expect(admission.residentBytes()).toBe(1);
});

it("stores and publishes only saves from the requested campaign", async () => {
  clients();
  mocks.parse.set("eu4", async (file) =>
    file.name === "other.eu4" ? eu4Save("other", "other-campaign") : eu4Save("accepted"),
  );
  const onFileComplete = vi.fn();
  const result = await importEu4Campaign(
    [new File([""], "other.eu4"), new File([""], "accepted.eu4")],
    "eu4-campaign",
    { onFileComplete },
  );
  expect(result.files).toEqual(["failed", "accepted"]);
  expect(result.failures).toEqual([
    { fileName: "other.eu4", error: expect.stringContaining("another campaign") },
  ]);
  expect(onFileComplete).toHaveBeenCalledWith({
    status: "accepted",
    file: expect.objectContaining({ name: "accepted.eu4" }),
    descriptor: expect.objectContaining({ campaignId: "eu4-campaign" }),
  });
});

it("can import again after a consumer stops the import with an error", async () => {
  clients();
  mocks.parse.set("eu4", async () => eu4Save("a"));
  await expect(
    importEu4Campaign([new File([""], "a.eu4")], "eu4-campaign", {
      onFileComplete: () => {
        throw Error("consumer failed");
      },
    }),
  ).rejects.toThrow("consumer failed");
  mocks.parse.set("eu4", async () => eu4Save("b"));
  const result = await importEu4Campaign([new File([""], "b.eu4")], "eu4-campaign");
  expect(result.files).toEqual(["accepted"]);
});
