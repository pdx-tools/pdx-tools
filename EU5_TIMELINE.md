# EU5 campaign history

This fork adds multi-save history inside the EU5 viewer. Open a local save, choose
**Over time** in the insight panel (or **History → Over time · add saves** in the
sidebar), and select additional `.eu5` files. The loaded save is included automatically.

## Viewer

- The bottom saved-date timeline works in every map mode. Previous, next, dragging
  and playback update the running renderer, rather than navigating or recreating
  the canvas. Dragging commits on release; dates are spaced by elapsed time.
- Current-date insights refresh after each switch. Charts retain their previous
  observation while calculating the next. Stable series/item IDs allow bars to
  resize and change rank, and scatter points to move. Native Sankey rendering
  recreates graphics, so a small geometry adapter tweens corresponding nodes and
  links. Import/export bars resize and move with their goods. Table rows use
  entity keys and move between positions; changed numbers flash green/red
  (increase/decrease, not a judgment about whether that change is beneficial).
  Reduced-motion preferences disable these transitions. Numeric cells, headline
  readouts, stat cards/rails and import/export figures use NumberFlow rolling
  digits. Existing decimal precision, separators, signs and K/M units remain;
  compact-unit changes use the actual scaled value to choose roll direction.
  `will-change` is not forced on every digit, keeping persistent layers bounded.
  Location population rows use kind/culture/religion keys and deterministic
  ordering for equal values.
- Political mode can switch between saved dates and its original ownership history.
- **Over time** follows the current section, selected country or selected market.
  Country Population/Religion tabs also choose the corresponding history view.
  Expand the history card in current-date sections to see trends in place.
  Political: population, state capacity, income and a country's great power rank.
  Control/effective development: weighted control, effective/lost development.
  Development/wealth: totals and averages. Tax: base gap and realization.
  Population: population and urbanization. Growth: recorded births and reproduction
  rate (not net growth). Buildings: levels, employment and types. Religion: faith
  populations and shares. RGO: levels and raw materials. Markets: price, supply,
  demand and stockpile for chosen goods/centers, restricted to a selected country's
  participating markets when viewing that country.
- History series keep a date cursor and moving observation markers. CSV export is
  available per graph. Lines join discrete saved observations, not simulated
  intermediate states.
- Camera, zoom, panel layout and map mode remain in place. Single country, location
  and market focus are restored where possible. Arbitrary multiple selections and
  the active viewed profile is remapped by country tag, location name or raw market center. Older breadcrumb entries are not remapped.
- Export selected raw observations as CSV, or the selected campaign's compact
  snapshots as schema-versioned JSON. The standalone `/eu5/timeline` entrance is
  retained, but the viewer panel is the primary interface.

## Data and caching

The Rust extractor uses the upstream typed Jomini parser. It extracts compact
observations in a sequential Web Worker. Location names come from the save's own
compatibility table; market series are joined by center location, not a reusable
market ID. A relocated market forms another series. Country series use tags. Rich country observations are computed in one location
pass plus one building pass, without loading map assets. Breakdown maps include
faith populations, building types and RGO materials. Unowned locations are excluded
from country/world histories. Building metrics use the location owner, not the
building investor. Urbanization counts towns, cities and megalopolises; unknown
settlement ranks are not assumed urban. Faith/RGO/building breakdowns show the six
largest categories across the imported dates, not every category.

A schema upgrade clears incompatible compact cache records: reselect the source
files once after upgrading. Raw saves are never stored in IndexedDB.

Campaign ID and the complete game version must match. Conflicting saves on the
same date are rejected. These keys do not identify a mod revision; separate
nightly campaigns and record the mod commit alongside diagnostic exports.

SHA-256 identifies saves. IndexedDB stores only compact schema-version-3
observations. Original `File` objects are retained for this browser session;
reselect files after a reload to resume map playback. Saves are not uploaded.
Cache errors leave the current session usable. Import failures are reported per file.

The game worker retains at most two full dated workspaces, sharing immutable
assets and localization. It prepares the next date, including search indexes and
summary metadata, before playback requests it. Old standby workspaces and their
indexes are evicted. A cold jump still needs parsing; the previous GPU frame stays
visible throughout. Map buffers and grouping data switch in one worker message.

## Performance

Expand **Performance monitor** at the foot of the history panel. It samples only
while visible and shows save arena usage/reservation, game/map Wasm capacity,
cache count, switch timing, preparation timings and map drawing rate.

Wasm capacity includes freed space available for reuse and does not shrink on
individual save eviction. Save arena figures exclude workspace vectors, immutable
assets and GPU resources. Measure whole-browser RAM separately with OS process
metrics; sum proportional set size (PSS) across the browser process tree to avoid
counting shared memory repeatedly.

Save arenas begin at 4 MiB and grow with actual allocations. Chromium redraws the
map when buffers, input or camera position change; input polling stays active.
Firefox retains the upstream continuous-drawing workaround. History chart options
are memoized, and expensive indexes/summaries are cached with each dated workspace.

For a stable local profiling session, disable automatic development refresh:

```sh
PDX_DISABLE_HMR=1 mise run dev:app
```

Normal development keeps HMR enabled. The development-only rendering override
exposed through the engine's profiling API allows comparing continuous and dirty
rendering in the same loaded viewer; it is not available in production.

## Local setup

Follow the main README for dependencies and licensed game assets. Build EU5 Wasm
and start the application using the repository's mise tasks. The portable Unix
Wasm build retains `zstd_c` without optional C fat LTO, avoiding incompatible
Clang/Rust LLVM bitcode versions. Windows retains the upstream Rust zstd path.

## Limits and next steps

- There is no daily simulation between save dates. Marker interpolation is visual
  animation, not inferred prices or estimated ownership. Missing observations stay gaps.
- Parsing support is inherited from upstream. One early vanilla snapshot encountered
  `missing field morale` and was skipped; later saves loaded.
- Full map views require compatible compiled game assets. Compact observation charts
  do not require those assets. This does not add mod-specific map bundles or variables.
- Very large saves still need a large active workspace. Cache count is bounded,
  rather than claiming a fixed total RAM budget.
- The nightly simulation lab's Parquet store is not connected yet. A future adapter
  can consume these compact observations with run/commit identifiers and explicit
  schema validation. The current JSON export provides that integration boundary.

No game assets, token dictionaries, raw saves or generated Wasm binaries are
included in this feature's source commits.

## Animation integration

EU5 enables `mergeUpdates` on every native EChart; other games retain their original
behavior. The Sankey adapter isolates ECharts' internal model accessor, which its
public TypeScript API does not expose. Check this small adapter when upgrading
ECharts. It stores only previous geometry for one update. It does not retain old
save data or duplicate canvases.

### Local measurements

A paired 15-second idle sample in the same visible Chromium viewer, same saved
state and paused timeline compared continuous rendering with drawing only changed
frames: 35.7% versus 5.8% CPU (100% = one CPU core). The map drew 2,831 versus zero
frames. Browser-process-tree PSS averaged 2,112 versus 2,118 MiB; this optimization
saves idle work, not GPU texture memory. The two retained save arenas reserved
120.1 MiB, versus the original roughly 200 MiB reservation, with about 98 MiB used.
Game and map Wasm capacities were 776.1 and 281.2 MiB. These capacities include
reusable high-water space, not only live allocations. Whole-browser figures also
include its other tabs. Hardware: local AMD RDNA2 GPU; development server.

Manual viewer checks loaded nine vanilla dates, changed each section, retained a
country history while advancing dates and retained the same map canvas. One warm
world-view switch took 13.4 ms in the worker; the value is not total UI latency.
Cold preparation observed roughly 0.1 s file read, 0.3 s parse and 0.03 s workspace
creation; large profile queries and simultaneous game simulation add work. Native
bar and Sankey shapes had active update animators during the country preview.
A location preview retained ten unique pop-group rows when reselected and recorded
68 concurrent rolling-digit animations during a dated update.
These are local observations, not a cross-hardware guarantee.
