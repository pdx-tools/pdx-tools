import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const root = join(import.meta.dirname, "../../../../../..");
const wasmDir = join(root, "src/app/app/wasm");
const tokens = join(root, "assets/tokens/eu5.bin");
const save = "Poland_1339-02-03.eu5";

const ready = existsSync(join(wasmDir, "wasm_eu5_bg.wasm")) && existsSync(tokens);
const required = process.env.PDX_REQUIRE_TEST_ASSETS === "1";

async function fixture(name: string) {
  const path = join(root, "assets/saves/eu5", name);
  if (!existsSync(path)) {
    const response = await fetch(`https://cdn-dev.pdx.tools/eu5-saves/${name}`);
    if (!response.ok) throw Error(`Could not download ${name}`);
    mkdirSync(join(root, "assets/saves/eu5"), { recursive: true });
    writeFileSync(path, new Uint8Array(await response.arrayBuffer()));
  }
  return new Uint8Array(readFileSync(path));
}

/** The import loader reads the file with the worker-only FileReaderSync. */
class SyncBlob extends Blob {
  constructor(private content: Uint8Array<ArrayBuffer>) {
    super([content]);
  }
  override slice(start = 0, end = this.content.length) {
    return new SyncBlob(this.content.subarray(start, end));
  }
  read() {
    return this.content.slice().buffer;
  }
}

afterEach(() => vi.unstubAllGlobals());

if (required && !ready) throw Error("EU5 analysis tests require the WASM parser and tokens");

it.skipIf(!ready)(
  "imports a real save into the Rust store and gives the same snapshot back",
  async () => {
    vi.stubGlobal(
      "FileReaderSync",
      class {
        readAsArrayBuffer = (blob: SyncBlob) => blob.read();
      },
    );
    const wasm = await import("@/wasm/wasm_eu5");
    await wasm.default({ module_or_path: readFileSync(join(wasmDir, "wasm_eu5_bg.wasm")) });
    wasm.set_tokens(new Uint8Array(readFileSync(tokens)));

    const loader = await wasm.ImportLoader.open(new SyncBlob(await fixture(save)));
    const parsed = loader.parse_import();
    // The game fields are in the same object as the common fields.
    expect(parsed.descriptor).toMatchObject({
      game: "eu5",
      date: "1339-02-03",
      artifacts: ["observations", "map"],
      world: { totalPopulation: 355_459_580 },
    });

    const store = new wasm.Eu5AnalysisStore();
    const reply = store.append(0, parsed.data, Infinity);
    expect(reply.descriptor).toEqual(parsed.descriptor);
    expect(reply.memory.snapshots).toBe(1);

    const stored = store.snapshot(parsed.descriptor.id);
    expect(stored.descriptor).toEqual(parsed.descriptor);
    expect(stored.data).toEqual(parsed.data);
    // A flattened Rust descriptor must reach JavaScript as an object, not a Map.
    for (const descriptor of [parsed.descriptor, reply.descriptor, stored.descriptor])
      expect(Object.getPrototypeOf(descriptor)).toBe(Object.prototype);
    expect(stored.data).toBeInstanceOf(Uint8Array);

    const { campaignId } = parsed.descriptor;
    const world = store.query({ generation: 0, campaignId, query: { kind: "worldPopulation" } });
    if (world.outcome.status !== "ok") throw Error(world.outcome.status);
    expect(world.outcome.answer.value.rows.map((row) => row.value)).toEqual([355_459_580]);
    // A location that the map does not have is a gap.
    const missing = store.query({
      generation: 0,
      campaignId,
      query: { kind: "locationPopulation", locationIds: [4_000_000_000] },
    });
    if (missing.outcome.status !== "ok") throw Error(missing.outcome.status);
    expect(missing.outcome.answer.value.rows.map((row) => row.value)).toEqual([undefined]);
    store.free();
  },
);
