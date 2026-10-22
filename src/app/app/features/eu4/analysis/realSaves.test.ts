import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { snapshotId } from "@/features/campaign/analysis/descriptor";
import { sessionApi } from "@/features/campaign/analysis/session";
import type { History, ProvinceImportMetadata } from "@/wasm/wasm_eu4";
import { eu4Queries } from "./analysisQueries";
import type { Eu4SaveAnalysis, ProvinceColumns } from "./analysisTypes";

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
    const api = sessionApi(Promise.resolve(store), eu4Queries);
    const campaigns = new Set<string>();
    for (const name of saves) {
      const { observation, provinces } = wasm.parse_analysis(await fixture(name)) as {
        observation: ProvinceImportMetadata;
        provinces: ProvinceColumns;
      };
      campaigns.add(observation.campaignId);
      const output: Eu4SaveAnalysis = {
        descriptor: {
          ...observation,
          id: snapshotId("eu4", observation.extractorVersion, observation.contentHash),
          game: "eu4",
          artifacts: ["observations"],
        },
        payload: { provinces },
      };
      expect((await api.append(0, output, Infinity)).duplicate).toBe(false);
    }
    expect(campaigns.size).toBe(1);
    const [campaignId] = campaigns;
    expect(store.memory()).toMatchObject({ snapshots: 3, layouts: 1 });

    const run = async (query: Parameters<typeof api.query>[0]["query"]) => {
      const reply = await api.query({
        generation: 0,
        campaignId,
        selection: { kind: "all" },
        identity: query.kind,
        sequence: 1,
        query,
      });
      if (reply.outcome.status !== "ok") throw Error(reply.outcome.status);
      const { rows } = reply.outcome.value as History;
      return rows.map((row) => [row.date, row.value]);
    };
    // These totals come from the save viewer's province list.
    expect(await run({ kind: "worldDevelopment", args: null })).toEqual([
      ["1528-07-01", 19311],
      ["1528-08-01", 19316],
      ["1547-03-05", 19888],
    ]);
    expect(await run({ kind: "provinceDevelopment", args: ITALY })).toEqual([
      ["1528-07-01", 196],
      ["1528-08-01", 196],
      ["1547-03-05", 198],
    ]);
  },
);
