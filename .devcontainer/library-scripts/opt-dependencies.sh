#!/bin/bash
set -euxo pipefail

MY_TMP="$(mktemp -d)"
trap 'rm -rf -- "$MY_TMP"' EXIT

# Nice to have dependencies that are not critical
cargo install cargo-upgrades
npm install -g npm-check-updates

# Install gcloud
cd "$HOME"
curl -o gcloud.tar.gz https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-518.0.0-linux-$(uname -m | sed 's/aarch64/arm/').tar.gz
tar -xf gcloud.tar.gz
./google-cloud-sdk/install.sh --quiet --path-update true
