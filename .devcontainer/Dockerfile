ARG NODE_VERSION=18
FROM mcr.microsoft.com/devcontainers/javascript-node:0-${NODE_VERSION}
ARG JUST_VERSION=1.5.0

RUN apt-get update && apt-get install -y \
      clang \
      imagemagick \
      netcat \
      openssl \
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
    tmp/library-scripts/npm-dependencies.sh && \
    tmp/library-scripts/opt-dependencies.sh

# https://github.com/devcontainers/ci/issues/257
RUN delgroup nvm
EXPOSE 3001 3003
