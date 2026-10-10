#!/usr/bin/env bash
set -euo pipefail
stream_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cargo build --release --target wasm32-unknown-unknown --manifest-path "$stream_root/Cargo.toml"
stream_target=${CARGO_TARGET_DIR:-$stream_root/target}
wasm-bindgen --target web "$stream_target/wasm32-unknown-unknown/release/eu5_streaming.wasm" --out-dir "$stream_root/pkg-blake3"
