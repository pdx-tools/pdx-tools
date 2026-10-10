# EU5 streaming timeline parser

This tool imports **uncompressed text saves** into the existing timeline observation schema. The viewer now uses it for timeline imports, defaulting to up to eight parsers based on CPU count (two on devices reporting at most 4 GiB RAM). ZIP/binary saves retain a serial full-parser fallback.

It combines selective Jomini deserialization, a fixed two-slot input bridge, and a bounded parser pool. Each parser has a dedicated `Blob.stream()` producer. Two SharedArrayBuffer slots provide backpressure: a producer cannot overwrite a slot until its consumer releases it. Rust reuses one chunk allocation and copies from a checked Uint8Array view without constructing a second JS array.

Only metadata, population, countries, locations, market current values, buildings, and religions are materialized. Unused sections and market breakdown/history arrays are skipped. The extractor body is generated from the viewer's current `snapshot.rs` during compilation, so changes to the source extractor are picked up automatically. Its required input model still needs to be maintained when the extractor adds dependencies.

## Build

Run in the repository toolchain (`mise exec --` if cargo/wasm-bindgen are not on PATH):

```sh
mise exec -- bash dev/eu5-streaming/build.sh sha256
mise exec -- bash dev/eu5-streaming/build.sh blake3
```

SHA-256 is the API default and preserves existing cache keys. BLAKE3 uses the official SIMD implementation and prefixes keys with `blake3:`. The viewer preserves existing SHA identities and records a BLAKE3 alias only after verifying the source SHA matches. New snapshots use BLAKE3 identities. Cache version 4 adds an alias store without deleting existing snapshots. One short-lived native SHA worker handles each one-time migration check, sequentially. Both paths hash all raw bytes in the same pass that feeds the parser, including headers and trailing bytes.

Generated packages and target directories are ignored by Git. The Rust dependency lock pins the same Jomini revision as the viewer. The source path dependencies are relative to this repository.

## Browser API

Serve the modules and generated packages from the same origin with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The PDX Tools development server already uses these headers. Secure contexts and dedicated workers are required. The BLAKE3 package additionally requires WebAssembly SIMD. A module bundler serving `pool.js` must preserve the relative worker and generated package URLs.

```js
import { importSnapshots } from './dev/eu5-streaming/pool.js';

const controller = new AbortController();
const result = await importSnapshots(fileInput.files, {
  concurrency: 4,
  parserBudgetMiB: 768,
  algorithm: 'sha256',
  signal: controller.signal,
  onSnapshot: async (snapshot, file, metrics) => {
    // Attach observations to the timeline and persist them here.
  },
  onProgress: ({ completed, total }) => console.log(completed, total),
});
```

The pool admits one save per parser and waits for `onSnapshot` before starting another on that slot. It queues File references, never complete raw buffers. Cancellation terminates parser workers; a parent worker's termination also terminates its nested producer. Failed jobs restart their parser slot and are reported in `result.errors`.

The budget is an **admission estimate**, not a hard browser RAM limit. Default estimates are 192 MiB per parser slot, including its input buffers and headroom. Returned observations, IndexedDB, the browser, maps and charts consume additional memory. Explicit concurrency can be 1–16; the budget can reduce the requested count. Eight workers require a budget of at least 1536 MiB; sixteen require 3072 MiB. The viewer chooses this admission estimate for its selected concurrency. `retainSnapshots: false` lets a sink own results without returning a second reference collection. The viewer batches state updates and writes, overlapping them with parsing while limiting unwritten observations to 16 plus the active parser count.

## Benchmark

Use a separate Chromium instance with remote debugging enabled. Do not point the benchmark at the user's viewer browser. Install Python Playwright separately; this is a manual benchmark, not an automated test suite.

The census is a JSON array of `[dateSort, absolutePath, fileSize]` rows. For archived sources, paths or symlink targets must have SHA-256 stems. At most 20 files are accepted. Optional `--hashes` supplies independently computed file-name-to-content-hash values; BLAKE3 requires it.

```sh
python dev/eu5-streaming/benchmark.py \
  --census /path/to/census-20.json \
  --out /path/to/benchmark-results \
  --cdp http://127.0.0.1:9237 \
  --app http://localhost:3001 \
  --algorithm sha256 --repeats 2
```

The harness compares the normal parser with 2/4/8/16 streaming parsers, includes history insertion and IndexedDB writes, verifies source hashes and full observation output, and samples the isolated browser process tree's PSS. Builds, OS-cache flushing, maps and charts are excluded. It requires Linux `/proc` for process memory sampling.

See [the measured results](../../EU5_STREAMING.md).

## Remaining scope

- ZIP and binary saves still require the normal loader. This prototype does not claim compressed-save streaming support.
- The active map and full country-detail view still need the full gamestate. This tool accelerates timeline observations only.
- Smaller input residency does not make a single save's Jomini deserialization parallel; the pool parses separate saves.
- The retained model can grow with campaign complexity. Full-archive checks now cover 336 saves through 1556; a completed 1700 campaign remains unmeasured.
- Persistent parsed observations and chart data still scale with snapshot count.
- Compatibility outside these saves and this browser has not been established. Source hash equality verifies byte identity; it does not establish that all game versions share the same schema.
