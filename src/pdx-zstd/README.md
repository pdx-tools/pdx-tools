# pdx-zstd

The native bindings to zstd via `zstd-rs` [do not compile to Wasm on Windows](https://github.com/gyscos/zstd-rs/issues/151) (due to requring clang as MSVC cannot target WebAssembly), so this crate defaults to the slower, less featureful, but pure rust `ruzstd` and provides a common API over both.
