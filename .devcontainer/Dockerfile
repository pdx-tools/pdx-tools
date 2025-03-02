ARG NODE_VERSION=20
FROM mcr.microsoft.com/devcontainers/javascript-node:1.0-${NODE_VERSION}-bookworm
ARG JUST_VERSION=1.5.0

RUN apt-get update && apt-get install -y \
      clang \
      imagemagick \
      musl-tools \
      openssl \
      rclone \
      webp \
      zstd \
    && \
    rm -rf /var/lib/apt/lists/* && \
    # Install just
    wget -O ${JUST_VERSION}.tar.gz https://github.com/casey/just/releases/download/${JUST_VERSION}/just-${JUST_VERSION}-x86_64-unknown-linux-musl.tar.gz && \
    tar xf ${JUST_VERSION}.tar.gz && \
    mv just /usr/bin/just

COPY library-scripts/*.sh /tmp/library-scripts/
RUN bash /tmp/library-scripts/dependencies.sh

USER node
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- --profile minimal --component rustfmt --component clippy -y && \
    . $HOME/.cargo/env && \
    rustup target add x86_64-unknown-linux-musl && \
    tmp/library-scripts/npm-dependencies.sh && \
    tmp/library-scripts/opt-dependencies.sh

EXPOSE 3001 3003
