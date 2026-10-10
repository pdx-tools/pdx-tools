#!/usr/bin/env bash
set -euo pipefail
stream_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
stream_algorithm=${1:-sha256}
case "$stream_algorithm" in
  sha256) stream_features=(--features sha256); stream_output=pkg-sha ;;
  blake3) stream_features=(); stream_output=pkg-blake3 ;;
  *) echo 'Usage: build.sh [sha256|blake3]' >&2; exit 2 ;;
esac
cargo build --release --target wasm32-unknown-unknown --manifest-path "$stream_root/Cargo.toml" "${stream_features[@]}"
stream_target=${CARGO_TARGET_DIR:-$stream_root/target}
wasm-bindgen --target web "$stream_target/wasm32-unknown-unknown/release/eu5_streaming.wasm" --out-dir "$stream_root/$stream_output"
