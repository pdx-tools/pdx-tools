#!/bin/bash
set -euxo pipefail

# Nice to have dependencies that are not critical
cargo install cargo-upgrades
npm install -g npm-check-updates
