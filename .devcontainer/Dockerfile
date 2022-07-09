ARG NODE_VERSION=16
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:0.203-${NODE_VERSION}-bullseye
ARG JUST_VERSION=1.2.0
ARG GIT_LFS_VERSION=3.0.2
ARG DOCKER_COMPOSE_VERSION=2.6.1

RUN apt-get update && apt-get install -y \
      ca-certificates \
      curl  \
      git \
      gnupg \
      imagemagick \
      lsb-release \
      netcat \
      openssl \
    && \
    # Install Docker
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y docker-ce docker-ce-cli containerd.io && \
    usermod -aG docker node && \
    rm -rf /var/lib/apt/lists/* && \
    # Install just
    wget -O ${JUST_VERSION}.tar.gz https://github.com/casey/just/releases/download/${JUST_VERSION}/just-${JUST_VERSION}-x86_64-unknown-linux-musl.tar.gz && \
    tar xf ${JUST_VERSION}.tar.gz && \
    mv just /usr/bin/just && \
    # Install docker compose
    curl -L "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-linux-$(uname -m)" -o /usr/local/bin/docker-compose && \
    chmod +x /usr/local/bin/docker-compose && \
    # Install git lfs
    curl -o git-lfs.deb -L "https://packagecloud.io/github/git-lfs/packages/debian/bullseye/git-lfs_${GIT_LFS_VERSION}_amd64.deb/download" && \
    dpkg -i git-lfs.deb

COPY library-scripts/*.sh /tmp/library-scripts/
RUN bash /tmp/library-scripts/dependencies.sh

USER node
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- --profile minimal --component rustfmt --component clippy -y && \
    . $HOME/.cargo/env && \
    tmp/library-scripts/npm-dependencies.sh && \
    tmp/library-scripts/opt-dependencies.sh

EXPOSE 3001 3003
