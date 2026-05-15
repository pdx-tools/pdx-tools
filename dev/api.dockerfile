FROM debian:13-slim AS builder

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

FROM gcr.io/distroless/cc-debian13

COPY --from=builder /rootfs/ /
COPY ./pdx-tools-api /app

ENV VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json

CMD ["/app"]
