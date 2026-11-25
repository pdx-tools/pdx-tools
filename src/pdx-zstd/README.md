# pdx-zstd

A small facade over zstd. Other crates use its API, so the implementation behind it (`src/backend.rs`) can be replaced without changing them.

The only implementation today is the C library through `zstd-rs`, on every target, including Wasm. Compiling C to Wasm needs a clang that can target it. Apple clang and MSVC can't, so mise installs the WASI SDK on macOS and Windows.
