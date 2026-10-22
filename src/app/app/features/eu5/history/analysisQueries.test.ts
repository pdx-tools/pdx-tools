import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { snapshotId } from "@/features/campaign/analysis/descriptor";
import { MEMORY_LIMIT_ERROR, sessionApi } from "@/features/campaign/analysis/session";
import type { History } from "@/wasm/wasm_eu5";
import { eu5Queries } from "./analysisQueries";
import type { MapFrame, SaveAnalysis } from "./analysisTypes";

const wasmPath = join(import.meta.dirname, "../../../wasm/wasm_eu5_bg.wasm");

function save(hash: string, dateSort: number, population: number[]): SaveAnalysis {
  const n = population.length;
  const layoutKey = `layout-${n}`;
  return {
    descriptor: {
      id: snapshotId("eu5", 1, hash),
      game: "eu5",
      campaignId: "campaign",
      contentHash: hash,
      date: String(dateSort),
      dateSort,
      gameVersion: "1.4.0",
      extractorVersion: 1,
      artifacts: ["observations", "map"],
      layoutKey,
      world: { locationCount: n, countryCount: 1, totalPopulation: 7 },
    },
    payload: {
      projection: {
        layoutKey,
        locationIds: Uint32Array.from([42, 43].slice(0, n)),
        fractions: new Uint16Array(n * 2).fill(49151),
        metrics: Float32Array.from(population.flatMap((p) => [12, p, 3, 2, 3, 1, 0.5])),
        owners: new Uint32Array(n).fill(7),
        controllers: new Uint32Array(n).fill(7),
        religions: new Uint32Array(n).fill(1),
        markets: new Uint32Array(n).fill(4),
        countries: new Uint32Array([7, 1, 1, 1]),
        religionColors: new Uint32Array([1, 1]),
        marketColors: new Uint32Array([4, 42, 1]),
      },
    },
  };
}

it.skipIf(!existsSync(wasmPath))(
  "keeps snapshots in the Rust store and gives frames and history back",
  async () => {
    const wasm = await import("@/wasm/wasm_eu5");
    await wasm.default({ module_or_path: readFileSync(wasmPath) });
    const store = new wasm.Eu5AnalysisStore();
    const api = sessionApi(Promise.resolve(store), eu5Queries);
    const first = save("a", 14000101, [100, 50]);
    await api.append(0, save("b", 14100101, [120.5]), Infinity);
    await api.append(0, first, Infinity);
    expect((await api.append(0, save("a", 14000101, [100, 50]), Infinity)).duplicate).toBe(true);

    const frame = store.frame(first.descriptor.id) as MapFrame;
    expect(frame.descriptor).toEqual(first.descriptor);
    expect(frame.projection).toEqual(first.payload.projection);

    const values = async (query: Parameters<typeof api.query>[0]["query"]) => {
      const reply = await api.query({
        generation: 0,
        campaignId: "campaign",
        selection: { kind: "all" },
        identity: query.kind,
        sequence: 1,
        query,
      });
      if (reply.outcome.status !== "ok") throw Error(reply.outcome.status);
      return (reply.outcome.value as History).rows.map((row) => [row.dateSort, row.value]);
    };
    expect(await values({ kind: "locationPopulation", args: [42, 43] })).toEqual([
      [14000101, 150],
      [14100101, null],
    ]);
    expect(await values({ kind: "worldPopulation", args: null })).toEqual([
      [14000101, 7],
      [14100101, 7],
    ]);

    // The store refuses a snapshot that does not fit, and keeps the others.
    const memory = await api.memory();
    await expect(
      api.append(0, save("c", 14200101, [1, 1]), memory.bufferBytes + 1),
    ).rejects.toMatchObject({ name: MEMORY_LIMIT_ERROR });
    expect((await api.memory()).snapshots).toBe(2);
    store.free();
  },
);
