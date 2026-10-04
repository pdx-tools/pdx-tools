# EU5 viewer profiling and targeted optimization

Measured locally on 2026-10-04. Baseline: `eb4715ff`.
[Recorded measurements](docs/eu5-performance-benchmark.json) include the original
counters, timings, saved-date hashes, and fresh-load/query samples.

## Controlled workload

Headed Chromium with native Vulkan, the development build, a 180 Hz display,
and a 3440 × 1251 viewport at device pixel ratio 1. The vanilla EU5 observer
continued running during both measurements. CPU percentages cover the dedicated
Chromium process tree; 100% means one CPU core. Both runs include profiler overhead.

The same 29 archived vanilla 1.4.0 files were selected, producing 28 usable
observations from April 1338 through April 1361. The April 1360 save fails the
existing typed parser because `morale` is missing. It remains an import notice.

Each playback comparison starts at the same first observation, in Population
mode with world scope, with the same camera, panel, and 1.2-second playback
cadence. The history runs end on the same hash; the current-date runs also end
on the same hash. Pointer input was blocked in the profiling window to prevent
country or section changes. Earlier samples with changing views were excluded.

We recorded Chrome's CPU profile and main-thread task duration, process-tree
CPU/PSS, browser requestAnimationFrame intervals, long tasks, ECharts setOption
calls, and canvas render events. RAF intervals measure responsiveness; they are
not a measurement of the chart animation frame rate.

## Results

| Measurement | Baseline | Optimized |
| --- | ---: | ---: |
| History playback, process-tree CPU | 109.2% | 90.8% |
| History playback, main-thread work | 2.794 s | 1.568 s |
| History playback, chart updates / canvas render events | 20 / 2,520 | 0 / 0 |
| Current-date Population playback, CPU | 181.1% | 172.0% |
| Current-date Population, main-thread work | 12.424 s | 11.057 s |
| Current-date Population, long-task count / total duration | 104 / 10.515 s | 36 / 3.892 s |
| Current-date Population, RAF interval, 95th percentile | 266.7 ms | 22.2 ms |
| Current-date Population, updates to clipped charts | 8 | 0 |
| Repeated England profile, median of 15 repeat requests | 33.6 ms | below 0.02 ms |
| Cached import, same 29 files | 24.0 s; replay 21.2 s | 15.7 s |

History playback reduced CPU by about 17% and main-thread work by 44%.
Current-date playback mainly improved responsiveness: long-task time fell 63%
and the 95th-percentile RAF interval fell 92%. Total CPU improved only about 5%.
The remaining current-date cost is chart text painting, React development work,
and preparation of the next full save.

Paused views already produced zero chart redraws. CPU remained around 9–12%; no
paused-view improvement is claimed. PSS depends on retained Wasm capacity,
garbage collection, and replay order, so no overall RAM reduction is claimed.

Fresh first-save loading was measured three times with identical date, world
counts, and profile payload sizes. Before: 2.02–3.28 seconds; after: 1.91–3.15
seconds. Background load makes a large fresh-load improvement inconclusive.
The cached multi-save import improvement is distinct from first-save loading.

## Changes retained

1. Skip unchanged options and unchanged chart dimensions. Honor an explicit
   `animation: false`; static history lines no longer acquire update animations.
2. Keep history lines on the existing canvas. A clipped HTML overlay moves the
   playhead and dots using transforms; date changes do not submit new line data.
   Zoom and resize recalculate overlay coordinates.
3. Create EU5 charts when they enter the visible scroll region, defer offscreen
   options, and stop their animation clocks while clipped. Scrolling into view
   applies the latest option.
4. Share completed and in-flight country profiles across consumers. Keep at most
   eight profiles for the current saved date. Switching saves clears the cache
   and waits for the switch before querying new indices. Location requests were
   already about 0.4 ms, so they were left uncached.
5. Render offscreen numeric readouts without NumberFlow digit trees, using one
   shared visibility observer. Visible rolling digits remain animated. Limit
   EU5 canvas animation updates to 60 Hz, retaining their wall-clock duration;
   synchronous updates bypass this limit. Use canvas dirty rectangles.
6. Cached timeline imports skip parser initialization and redundant IndexedDB
   writes. Reattaching matching content hashes preserves existing observation
   references. Initial file hashing overlaps parsing and localization.

The frame limit wraps ZRender's typed public `animation.update` method for EU5
charts. This adapter should be checked when upgrading ECharts/ZRender. Other
games retain their existing rendering path.

## Interaction checks

- History series data remained identical across date changes; cursors retained
  800 ms movement and the same map canvas stayed mounted.
- Market zoom at 15–85% survived a save switch.
- Scrolling the Population panel initialized a deferred fourth chart.
- Reselecting London preserved all ten population row identities and their order.
- Live sampling found 51 simultaneous digit animations and 23 chart animators
  in the location view, including Sankey transitions.
- No page errors were observed during these checks. TypeScript checking passed.

These are local browser measurements and interaction checks, not cross-device
performance guarantees or a production-build benchmark.
