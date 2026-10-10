# Playback validation — 10 October 2026

Manual local Chromium test, isolated browser profile, five observer snapshots.

- Previously problematic 1360-01-01 loads with the optional subunit morale fallback.
- Injected a synthetic corrupt source at 1360-04-01 under a unique test hash. Playback reports Invalid header, skips it, reaches 1363-04-01, and stops at the end.
- Final prepared switch: 14.9 ms, cacheHit=true. Previous run: 17.8 ms. These are individual observations, not a comparative speed benchmark.
- Preparation sample: parse 387 ms, workspace 36 ms. Software-rendered headless Chromium; not representative of GPU rendering performance.
- RGO scatter: 53 points, 53 distinct IDs, every ID matches rawMaterial.key.
- TypeScript noEmit and git diff whitespace check pass. Release wasm-eu5 build passes.

Foreground switches now take priority over queued prefetch jobs, but cannot interrupt parsing already in progress. Full-state lookahead is limited to two future dates and an estimated 768 MiB arena budget. This is not a browser RAM cap. The old active state is released after successful switching.

The synthetic fixture only changes an isolated browser File attachment. Original saves and user cache are untouched. No broad benchmark of all campaign dates was performed.
