FROM rust:1.92.0-trixie AS builder

WORKDIR /work
COPY . .

# The cache mounts keep the cargo registry and build output between builds.
# The build scripts read ./assets/tokens and ./assets/game/eu4, so those
# directories must be in the build context. The tokenize step uses the
# release profile so that it shares compiled dependencies with the api.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/work/target \
    cargo run --release --package pdx-tokenize-cli -- ./assets/tokens \
    && cargo build --package pdx-tools-api --release \
    && cp target/release/pdx-tools-api /pdx-tools-api

FROM debian:13-slim AS vulkan

RUN apt-get update && apt-get install -y --no-install-recommends \
    mesa-vulkan-drivers \
    && rm -rf /var/lib/apt/lists/*

# Collect only the lvp driver and its transitive deps (skipping libs already
# in distroless/cc: libc, libm, libgcc_s, libstdc++).
RUN set -e; \
    LIB=/usr/lib/x86_64-linux-gnu; \
    mkdir -p /rootfs${LIB} /rootfs/usr/share/vulkan/icd.d; \
    cp /usr/share/vulkan/icd.d/lvp_icd.json /rootfs/usr/share/vulkan/icd.d/; \
    cp ${LIB}/libvulkan.so.1 ${LIB}/libvulkan_lvp.so /rootfs${LIB}/; \
    ldd ${LIB}/libvulkan.so.1 ${LIB}/libvulkan_lvp.so \
        | awk '/=>/ { print $3 }' \
        | grep -vE 'libc\.so|libm\.so|libdl\.so|libpthread|librt\.so|libgcc_s|libstdc\+\+' \
        | sort -u \
        | xargs -I{} cp -L {} /rootfs${LIB}/

FROM gcr.io/distroless/cc-debian13:nonroot

COPY --from=vulkan /rootfs/ /
COPY --from=builder /pdx-tools-api /app

ENV VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json

CMD ["/app"]
