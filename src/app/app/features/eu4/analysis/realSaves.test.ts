import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { MEMORY_LIMIT_ERROR, STALE_GENERATION_ERROR } from "@/features/campaign/analysis/session";
import type { Eu4Query, Eu4Snapshot } from "@/wasm/wasm_eu4";

const root = join(import.meta.dirname, "../../../../../..");
const wasmDir = join(root, "src/app/app/wasm");
const tokens = join(root, "assets/tokens/eu4.bin");
const saves = ["ita2.eu4", "ita2_later.eu4", "ita2_later13.eu4"];
/** Genoa, Milan, Venice, Florence, Siena, Rome and Naples. */
const ITALY = [101, 104, 112, 116, 117, 118, 121];

const ready = existsSync(join(wasmDir, "wasm_eu4_bg.wasm")) && existsSync(tokens);
const required = process.env.PDX_REQUIRE_TEST_ASSETS === "1";

async function fixture(name: string) {
  const path = join(root, "assets/saves/eu4", name);
  if (!existsSync(path)) {
    const response = await fetch(`https://cdn-dev.pdx.tools/eu4-saves/${name}`);
    if (!response.ok) throw Error(`Could not download ${name}`);
    mkdirSync(join(root, "assets/saves/eu4"), { recursive: true });
    writeFileSync(path, new Uint8Array(await response.arrayBuffer()));
  }
  return new Uint8Array(readFileSync(path));
}

if (required && !ready) throw Error("EU4 analysis tests require the WASM parser and tokens");

it.skipIf(!ready)(
  "imports real saves of one campaign and agrees with the parsed saves",
  async () => {
    const wasm = await import("@/wasm/wasm_eu4");
    await wasm.default({ module_or_path: readFileSync(join(wasmDir, "wasm_eu4_bg.wasm")) });
    wasm.set_tokens(new Uint8Array(readFileSync(tokens)));

    const store = new wasm.Eu4AnalysisStore();
    const parsed: Eu4Snapshot[] = [];
    for (const name of saves) parsed.push(wasm.parse_analysis(await fixture(name)));
    const campaigns = new Set(parsed.map((snapshot) => snapshot.descriptor.campaignId));
    expect(campaigns.size).toBe(1);
    const [campaignId] = campaigns;

    // The store refuses a snapshot that does not fit, and one from a
    // generation that a clear ended.
    expect(() => store.append(0, parsed[0].data, 1)).toThrow(
      expect.objectContaining({ name: MEMORY_LIMIT_ERROR }),
    );
    store.clear(1);
    expect(() => store.append(0, parsed[0].data, Infinity)).toThrow(
      expect.objectContaining({ name: STALE_GENERATION_ERROR }),
    );
    for (const { data, descriptor } of parsed) {
      const reply = store.append(1, data, Infinity);
      expect(reply.duplicate).toBe(false);
      expect(reply.descriptor).toEqual(descriptor);
    }
    expect(store.memory()).toMatchObject({ snapshots: 3, layouts: 1 });
    const stored = store.snapshot(parsed[0].descriptor.id);
    expect(stored.descriptor).toEqual(parsed[0].descriptor);
    expect(stored.data).toEqual(parsed[0].data);

    const run = (query: Eu4Query) => {
      const reply = store.query({ generation: 1, campaignId, query });
      if (reply.outcome.status !== "ok") throw Error(reply.outcome.status);
      expect(reply.outcome.answer.kind).toBe(query.kind);
      return reply.outcome.answer.value.rows.map((row) => [row.date, row.value]);
    };
    // These totals come from the save viewer's province list.
    expect(run({ kind: "worldDevelopment" })).toEqual([
      ["1528-07-01", 19311],
      ["1528-08-01", 19316],
      ["1547-03-05", 19888],
    ]);
    expect(run({ kind: "provinceDevelopment", provinceIds: ITALY })).toEqual([
      ["1528-07-01", 196],
      ["1528-08-01", 196],
      ["1547-03-05", 198],
    ]);
    expect(
      store.query({ generation: 0, campaignId, query: { kind: "worldDevelopment" } }).outcome,
    ).toEqual({ status: "stale" });
    store.free();
  },
);
