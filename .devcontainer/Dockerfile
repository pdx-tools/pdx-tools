FROM mcr.microsoft.com/devcontainers/base:1-bookworm

ARG TARGETARCH

RUN if [ "$TARGETARCH" = "amd64" ]; then dpkg --add-architecture i386; fi && \
    apt-get update && apt-get install -y \
      clang \
      imagemagick \
      libssl-dev \
      mesa-vulkan-drivers \
      musl-tools \
      pkg-config \
      webp \
      zstd \
      $(if [ "$TARGETARCH" = "amd64" ]; then echo "libgcc-s1:i386 libstdc++6:i386"; fi) \
    && \
    rm -rf /var/lib/apt/lists/*

RUN if [ "$TARGETARCH" = "amd64" ]; then \
      mkdir -p /usr/local/steamcmd && \
      curl -fsSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz \
        | tar -xz -C /usr/local/steamcmd && \
      ln -s /usr/local/steamcmd/steamcmd.sh /usr/local/bin/steamcmd && \
      chown -R vscode:vscode /usr/local/steamcmd; \
    else \
      printf '%s\n' \
        '#!/bin/sh' \
        'echo "steamcmd is only installed in the amd64 devcontainer image." >&2' \
        'exit 1' \
        > /usr/local/bin/steamcmd && \
      chmod +x /usr/local/bin/steamcmd; \
    fi

USER vscode

RUN curl https://mise.run | MISE_VERSION=v2026.4.5 sh && \
    /bin/bash -c 'echo "eval \"\$(~/.local/bin/mise activate bash --shims)\"" >> ~/.bashrc'

EXPOSE 3001 3003
