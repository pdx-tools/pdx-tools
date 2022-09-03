#!/bin/bash
set -euxo pipefail

MY_TMP="$(mktemp -d)"
trap 'rm -rf -- "$MY_TMP"' EXIT

WASM_OPT_V=version_110
curl -o "$MY_TMP/binaryen.tar.gz" -L "https://github.com/WebAssembly/binaryen/releases/download/${WASM_OPT_V}/binaryen-${WASM_OPT_V}-x86_64-linux.tar.gz"
(cd "$MY_TMP" && tar -xzf "binaryen.tar.gz")
mv "$MY_TMP/binaryen-$WASM_OPT_V/bin/wasm-opt" "/usr/local/bin/."

curl -o "$MY_TMP/flatc.zip" -L "https://github.com/google/flatbuffers/releases/download/v2.0.0/Linux.flatc.binary.clang++-9.zip"
(cd "$MY_TMP" && unzip flatc.zip)
chmod +x "$MY_TMP/flatc"
mv "$MY_TMP/flatc" "/usr/local/bin/."
