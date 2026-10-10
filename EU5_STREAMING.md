# EU5 streaming parser measurements

## Current viewer integration

The viewer now defaults to BLAKE3 streaming for text timeline imports, with up to eight parsers based on CPU count and a lower limit for devices reporting at most 4 GiB RAM. Compressed/binary saves use a serial normal-parser fallback. Existing SHA cache identities are retained through cryptographically verified BLAKE3 aliases; cache version 4 preserves existing records. The map/full detail parser is unchanged.

See [the integration and memory profile](docs/eu5-streaming/INTEGRATION.md) for 4/8/16-worker comparisons, the 336-save measurements, and the bounded background write queue. The measurements below are the earlier streaming prototype experiments.

Measured 10 October 2026. Twenty representative, previously parseable uncompressed text saves, 1338–1437, totaling 5.81 GiB. Each final suite has two trials per method, reversing order on the second pass. The EU5 observer game remained running; comparisons use each suite’s own baseline. No 120-save iteration was run in this earlier suite.

## Result

A selective parser fed by a fixed shared-buffer bridge keeps parallel imports fast without retaining whole saves. Four BLAKE3 streaming parsers are faster and use less total browser memory than either one or two normal parsers in this experiment. SHA-256 remains available with its existing cache identity; its portable Wasm implementation costs more CPU.

## BLAKE3 suite

| Method | Median seconds | Trial seconds | Peak browser PSS GiB per trial | Max per-parser Wasm MiB | Median browser CPU seconds |
|---|---:|---|---|---:|---:|
| bounded-2 | 10.32 | 11.05, 9.59 | 1.02, 0.99 | 79.75 | 28.92 |
| fixed-copy-2 | 13.83 | 14.85, 12.81 | 4.16, 3.96 | 79.75 | 27.88 |
| full-2 | 13.49 | 14.53, 12.46 | 3.29, 3.47 | 502.50 | 27.90 |
| bounded-4 | 6.54 | 6.91, 6.17 | 1.24, 1.21 | 79.75 | 33.24 |
| fixed-copy-4 | 7.88 | 8.16, 7.61 | 3.26, 3.34 | 79.75 | 29.39 |
| full-1 | 21.74 | 21.88, 21.59 | 2.14, 1.88 | 511.81 | 24.86 |

## SHA-256 suite

Separate run, with its own normal-parser baselines. Every source SHA-256 matches the immutable archive.

| Method | Median seconds | Trial seconds | Peak browser PSS GiB per trial | Max per-parser Wasm MiB | Median browser CPU seconds |
|---|---:|---|---|---:|---:|
| bounded-4-sha256 | 13.23 | 14.21, 12.24 | 1.24, 1.16 | 79.75 | 57.84 |
| full-2 | 13.73 | 15.37, 12.10 | 3.08, 3.24 | 502.50 | 28.33 |
| bounded-8-sha256 | 10.27 | 11.41, 9.13 | 1.50, 1.57 | 79.75 | 65.82 |
| full-1 | 21.63 | 21.81, 21.45 | 2.07, 2.16 | 511.81 | 24.96 |

## What changed

1. **Selective materialization.** Keep only the seven top-level sections used by the timeline. Skip war, character, unit, diplomacy and other unused sections. A compact market model excludes price histories and breakdown arrays. The normal snapshot extraction algorithm is reused. Maximum observed per-parser Wasm capacity fell from about 503 MiB to 80 MiB.
2. **Fixed input slots and backpressure.** A dedicated producer reads `Blob.stream()` and fills two 8 MiB SharedArrayBuffer slots. A synchronous Wasm reader consumes them. The producer waits for a released slot before overwriting it. Rust reuses one 8 MiB chunk allocation. The explicitly managed input buffers are therefore 24 MiB per parser; the model and browser have additional allocations.
3. **Avoid the extra JS array copy.** Casting a checked Uint8Array to its existing wrapper avoids `new Uint8Array(typedArray)`, which copied every chunk. The generated bindings confirmed the avoidable copy. Removing this alone did **not** solve peak memory: see the `fixed-copy` cases, which still use FileReaderSync slices. The shared-buffer input is the measured memory improvement.
4. **Hash while parsing.** Both SHA-256 and BLAKE3 process all raw source bytes in the same pass as the parser, including header/trailing bytes. Hashing is not disabled. SHA preserves existing keys; BLAKE3 uses `blake3:` keys. The integrated viewer now handles existing identities through verified aliases.
5. **Bounded concurrency and downstream work.** The reusable pool admits at most the configured worker count and an estimated parser budget. It awaits each observation sink before starting another save on that slot. Queued work contains File references, not raw buffers.

## Correctness

- All final cases parsed 20/20 saves without errors. Full observation output matched, including nested religion/material/building Maps, country metrics, market values, metadata and labels.
- SHA cases verified every raw SHA-256 against the archive. BLAKE3 cases verified every raw digest against an independent native BLAKE3 pass over the same immutable files. Native and Wasm implementations used different optimized target paths.
- For BLAKE3 observation comparisons, only the source-identity `hash` field was normalized to the archive’s SHA-256 before comparing complete outputs. The returned cache key remains the actual prefixed BLAKE3 digest. No observation values were removed from the comparison.
- The checked-in worker pool was also built in both hash modes and run on the same 20 files; [repository validation](docs/eu5-streaming/repository-validation.json) records source hashes and full observation parity.
- Canonical output is 44,992,923 bytes; SHA-256 `39c0c37fb4cc31a02965c8e7aec0df4dac352661f1252c346575d1909cd25c9e`.

## Rejected approaches and limitations

- A long-lived native-WebCrypto hashing worker followed by streaming parsers retained too much memory: exploratory two-parser peaks reached about 4–5 GiB. Short-lived hashing workers improved this but still needed a whole input buffer and a second file pass. The final shared-buffer path hashes inside the parser instead.
- Portable Wasm SHA-256 costs considerably more CPU than native WebCrypto. Eight SHA workers trade CPU concurrency for throughput; they are not a universal default. BLAKE3 SIMD is the lower-CPU streaming option measured here.
- FileReaderSync slices, even after the extra JS copy was removed, had inconsistent high total PSS. These experiments do not attribute every retained browser allocation to a particular GC or native component.
- The shared reader requires a secure, cross-origin-isolated context. BLAKE3 SIMD requires a compatible Wasm runtime. The development server already supplies COOP/COEP.
- ZIP/binary streaming is not implemented. Compressed saves continue to work through the normal loader. The active map/full detail model also still uses that loader.
- The budget limits admitted parsers using measured estimates. It is not a hard limit on all browser allocations. Observations and charts still grow with snapshot count.
- Twenty known-good saves were selected; the existing two missing-morale saves were excluded from this corpus. Later campaign complexity and other game versions remain unmeasured.

## Measurement details

- AMD Ryzen 7 5800X3D, 32 GiB RAM, Linux, isolated headless Chromium on CDP 9237. The user’s viewer browser and EU5 were not terminated.
- Timings include read/hash/parse, worker results, history insertion and batched IndexedDB writes. Builds and final validation serialization/digest are excluded from timed import.
- Total browser process-tree PSS is sampled once per second, including validation time; brief peaks may be missed. Wasm capacity is recorded directly per worker. These numbers measure different things.
- Observation cache bypassed; OS and HTTP caches enabled. No GPU map, React subscription or chart rendering in the import harness. End-to-end viewer latency was not measured.
- CPU figures include final validation work and are cumulative process-tree samples; they are useful context, not exact per-stage CPU profiles.
- Production baseline and the separate experimental module use the same pinned Jomini revision and extractor; release/LTO settings can differ.

## Code and data

- [Parser and worker pool](dev/eu5-streaming/README.md). SHA-256 remains the reusable low-level API default; the viewer coordinator explicitly chooses BLAKE3.
- [BLAKE3 trial data](docs/eu5-streaming/bounded-blake3.json), [SHA-256 trial data](docs/eu5-streaming/bounded-sha256.json).
- The portable manual harness accepts at most 20 saves and can repeat these comparisons. The archive paths and manifests are machine-local and are not committed.

## Primary references

- [Official BLAKE3 implementation](https://github.com/BLAKE3-team/BLAKE3) and [incremental Rust API / Wasm SIMD feature](https://docs.rs/blake3/latest/blake3/).
- [WHATWG Streams backpressure](https://streams.spec.whatwg.org/#pipe-chains).
- [Jomini](https://github.com/rakaly/jomini): reader-based Paradox deserialization.
- [SubtleCrypto.digest](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest): native API requires whole input and has no incremental interface.
