FROM mcr.microsoft.com/devcontainers/base:1-bookworm

RUN apt-get update && apt-get install -y \
      clang \
      imagemagick \
      libssl-dev \
      musl-tools \
      pkg-config \
      webp \
      zstd \
    && \
    rm -rf /var/lib/apt/lists/*

USER vscode

RUN curl https://mise.run | MISE_VERSION=v2025.8.12 sh && \
    /bin/bash -c 'echo "eval \"\$(~/.local/bin/mise activate bash --shims)\"" >> ~/.bashrc'

EXPOSE 3001 3003
