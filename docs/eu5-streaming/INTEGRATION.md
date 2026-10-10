# Viewer integration and memory profile

Measured 10 October 2026 on Ryzen 7 5800X3D / 32 GiB, with EU5 running. Only the isolated benchmark Chromium profile was modified or cleared.

## Implemented

- `SaveHistory` uses BLAKE3 streaming for text timeline imports. Defaults to up to eight parsers based on logical CPU count; devices reporting at most 4 GiB RAM are capped at two. The reusable pool accepts 1–16 with an estimated admission budget.
- Cache database version 4 preserves snapshots and adds verified BLAKE3-to-SHA aliases. Existing SHA identities, selections and file connections remain valid. A source SHA match is required before recording an alias; dates, names and summaries are insufficient. One short-lived native SHA worker runs at a time for migration checks, then terminates to release native allocations. These one-time checks add a full read/hash pass for old records; later imports use the alias.
- Matching observations already in memory are reused; the importer no longer retrieves and clones an entire IndexedDB snapshot after parsing it.
- State updates and IndexedDB writes run in batches while parsing continues. Backpressure limits unwritten observations to 16 plus the active parser count. Import completion waits for pending writes. Progress updates are throttled. The viewer disables the pool's second result reference collection.
- Country aggregation borrows country-tag keys and allocates religion/material/building keys only on first occurrence. Full nested-Map observation parity is preserved.
- Compressed/binary saves use one normal full parser after the text pool ends. Its JS input buffer is detached after copying into Wasm. A bounded footer check detects ZIPs incorrectly labelled as plain text. The active-map parser remains unchanged.
- Import limit raised from 200 to 1000 file references. Retained timeline data still grows with snapshot count; this is not a total-browser RAM cap.
- Build tasks generate both streaming Wasm packages; production workers use static imports. Existing tabs need one reload to use the updated importer. Persistent cache entries are preserved.

## Worker-count comparison: 20 saves

Same 20 known-good saves, 5.81 GiB, 1338–1437. Two trials per method, reversed order on the second pass. These cases use the pool directly with individual IDB writes and history insertion, without React subscribers. Peak is the maximum of the two sampled process-tree PSS peaks.

| Parsers | Median import seconds | Peak browser PSS GiB |
|---|---:|---:|
| 4 | 6.74 | 1.37 |
| 8 | 5.03 | 1.79 |
| 16 | 5.17 | 2.29 |

Eight is the default compromise. Sixteen did not win this direct-pool comparison but did win the later coordinator comparison and earlier full-archive run. These results do not establish a universally fastest count.

## Bounded background writes: 20 saves

Separate paired comparison of the actual viewer coordinator. Two trials, reversed order. The baseline waited for each batch write before advancing every parser slot; the new version advances until its bounded write queue fills. Both versions use the same parser and worker modules. All observation digests and independent source BLAKE3 hashes matched.

| Coordinator | Parsers | Median seconds | Trial seconds |
|---|---:|---:|---|
| Await each sink | 8 | 5.75 | 6.44, 5.06 |
| Bounded write queue | 8 | 5.16 | 4.89, 5.44 |
| Bounded write queue | 16 | 4.76 | 4.68, 4.84 |

The eight-parser median improved about 10%; variance is material. Grouping all writes at the end did not consistently help. Smaller 1/4 MiB input chunks were slower than 8 MiB. Restarting a parser after every file also slowed imports. Those settings were not adopted. The extractor allocation change improved paired medians from 5.74 to 5.55 seconds (~3.3%), but CPU totals were nearly unchanged, so that small timing difference remains uncertain.

## Full archive and RAM diagnosis

Frozen workload: **336 immutable saves**, **115.13 GiB**, 1338-04-01 to 1556-04-01. All were accepted by the selective timeline extractor.

| Run | Parsers | Import seconds | Peak PSS GiB |
|---|---:|---:|---:|
| Original direct sink | 16 | 92.37 | 5.18 |
| Coordinator waiting on writes | 8 | 105.68 | 3.52 |
| Coordinator with bounded write queue | 8 | 102.94 | 3.48 |

Each full-archive number is one run. The 16-parser case used the earlier direct sink, so its comparison with the coordinator is indicative, not a controlled worker-count-only experiment. The ~2.6% full-archive write-queue speedup needs repeat measurements to establish it reliably. Lower RAM is the clearest large-archive benefit of eight parsers here.

CDP heap measurements and cleanup after the final eight-parser run:

| Phase | Browser PSS GiB |
|---|---:|
| Peak import | 3.48 |
| Parser workers stopped | 1.73 |
| Garbage collected, timeline retained | 1.40 |
| Isolated in-memory timeline cleared, garbage collected | 0.62 |

The retained timeline used **764 MiB of main-page JS heap** for 336 dates. Clearing it reduced that heap to 1.47 MiB. This is real observation storage that scales with campaign length. Each streaming parser additionally reserves up to ~80 MiB of Wasm and two 8 MiB input slots. Its reused 8 MiB Rust chunk is included in Wasm memory. Worker/browser heaps, result transfer and IDB serialization add temporary allocations. Sixteen parsers double worker-dependent costs. Peak PSS therefore exceeds the Wasm estimate; it does not mean all 115 GiB of source saves were held in RAM. These measurements do not attribute every native allocation individually or prove the absence of every leak.

## Verification and limitations

- Integrated cold import, verified SHA alias migration, warm reattachment, unchanged selected identity, rejection of different-byte same-date files, and cancellation passed on 20 saves. A separate check seeded a version-3 database and confirmed the version-4 upgrade preserved it. Duplicate byte-identical imports preserved the active File connection. No user cache reset is required.
- Full Map-aware observation SHA remains `39c0c37fb4cc31a02965c8e7aec0df4dac352661f1252c346575d1909cd25c9e`. Independent native BLAKE3 hashes matched all 20 source files.
- Full 336-save runs checked all dates/campaign IDs against source headers, hash format, and complete raw-byte consumption. They did not independently rehash all 115 GiB or compare every field against the full parser. Skipped gamestate sections are not fully validated.
- A DEFLATE ZIP fixture made from a known-good observer save passed the normal fallback and complete observation parity. A ZIP with an incorrectly labelled text header also passed. Original source files were unchanged.
- An older Korean binary backup reached the normal parser but failed with its existing `missing field provinces` model error. The new fallback does not fix compatibility of older saves with the current full model.
- TypeScript checking and production app build passed. No automated test suite was added or run. Checks were manual benchmarks and validations requested by the user.
- Timing includes read/hash/parse, results, history insertion, persistence and worker shutdown. Builds, cache clearing, validation serialization and cleanup GC are excluded. OS/HTTP caches were not flushed. React chart/map rendering was excluded. PSS sampled every 0.5–1 second can miss brief peaks. The final footer safeguard was added after full-archive timing and verified separately.

Adjacent JSON files contain the measurements and validation records. External manual scripts and the immutable census remain under the local `eu5-benchmark/stream-profile` directory. Raw saves are not committed.
