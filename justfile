set dotenv-load := true
set positional-arguments

# "unset" the token environment variables as we inline a flatbuffer variant and
# don't want the compile time and (small) performance penalty of compile time
# tokens.
export EU4_IRONMAN_TOKENS := ""
export HOI4_IRONMAN_TOKENS := ""
export CK3_IRONMAN_TOKENS := ""
export IMPERATOR_TOKENS := ""

export NEXT_PUBLIC_SENTRY_DSN := `echo ${SENTRY_DSN:-''}`

release:
  #!/usr/bin/env bash
  set -euxo pipefail
  export PDX_RELEASE=1

  if [[ $(git status --porcelain --untracked-files=no) ]]; then
    echo "Address uncommitted changes before release"
    exit 1
  fi

  just build
  just publish-frontend

  if [[ $(grep -c pdx-tools-prod ~/.ssh/config || echo "0") -gt 0 ]]; then
    just publish-backend
  else
    echo "pdx-tools-prod not found in ssh config, please add it and then run just publish-backend"
  fi

build: build-wasm build-napi build-app build-docker

build-rust:
  cargo build --all

dev: build-wasm-dev build-napi dev-app

staging: build-napi build-app prep-dev-app
  #!/usr/bin/env bash
  set -euxo pipefail
  cd src/app
  . .env.production
  
  npx --yes concurrently@latest \
    "PORT=3001 node_modules/.bin/next start" \
    "wrangler dev --port 3003 --local --local-upstream localhost:3001 --var AWS_S3_HOST:localhost --var AWS_S3_PORT:$S3_PORT --var AWS_S3_BUCKET:$S3_BUCKET --var AWS_DEFAULT_REGION:$S3_REGION --var AWS_ACCESS_KEY_ID:$S3_ACCESS_KEY --var AWS_SECRET_ACCESS_KEY:$S3_SECRET_KEY"

test: (cargo "test" "--workspace" "--exclude" "pdx" "--exclude" "wasm-*") test-wasm (cargo "test" "-p" "pdx" "--all-features") test-app

# Disable zstd fat-lto which cause linking issues for tests
test-wasm: (cargo "test" "--no-default-features" "--features" "miniz" "-p" "wasm-*")

setup:
  #!/usr/bin/env bash
  set -euxo pipefail

  ./.devcontainer/library-scripts/npm-dependencies.sh
  sudo ./.devcontainer/library-scripts/dependencies.sh
  just npm-ci

npm-ci:
  (cd src/docs && npm ci)
  (cd src/app && npm ci)
  (cd src/app/workers-site && npm ci)

publish-backend:
  docker image save ghcr.io/pdx-tools/pdx-tools:nightly | gzip | ssh pdx-tools-prod 'docker load && /opt/pdx-tools/docker-compose.sh up -d api'

wrangler +cmd:
  cd src/app && wrangler "$@"

publish-frontend: (wrangler "publish")
publish-frontend-dev: (wrangler "publish" "--env" "dev")

build-app: prep-frontend
  cd src/docs && npm run build
  cd src/docs/build && cp -r assets blog changelog docs img ../../app/public/.
  cd src/app && npm run build

build-docker:
  docker build -t ghcr.io/pdx-tools/pdx-tools:nightly -f ./dev/app.dockerfile ./src/app

build-admin:
  #!/usr/bin/env bash
  set -euxo pipefail
  if [[ $REMOTE_CONTAINERS == "true" ]]; then
    # If we're within the dev container then we need to use special cross within
    # docker instructions, and workaround how the devcontainer uses "host"
    # networking so `hostname` doesn't return the name of the container.
    HOSTNAME=$(docker ps | grep vsc-pdx-tools | cut -d' ' -f 1) cross build --package pdx --features admin --release --target x86_64-unknown-linux-musl
  else
    cargo build --package pdx --features admin
  fi

cargo *cmd:
  cargo "$@"

dev-app: prep-frontend prep-dev-app
  #!/usr/bin/env bash
  set -euxo pipefail
  . src/app/.env.development
  . dev/.env.dev
  export DATABASE_URL=postgresql://postgres:$DATABASE_ADMIN_PASSWORD@localhost:$DATABASE_PORT
  (cd src/app && npx prisma migrate dev --name init)

  npx --yes concurrently@latest \
    "PORT=3001 src/app/node_modules/.bin/next dev src/app" \
    "cd src/docs && npm run docusaurus -- start --no-open"

test-app *cmd: prep-frontend prep-test-app
  #!/usr/bin/env bash
  set -euxo pipefail

  export NODE_ENV=test
  APP_OUT="$(mktemp)"
  trap 'cat "$APP_OUT.stdout" "$APP_OUT.stderr"' ERR
  trap 'rm -rf -- "$APP_OUT.stdout" "$APP_OUT.stderr"' EXIT

  # TODO: I need the naked `next` else killing pid doesn't kill next 
  src/app/node_modules/.bin/next dev src/app > "$APP_OUT.stdout" 2> "$APP_OUT.stderr" &
  APP_PID=$!
  trap 'kill "$APP_PID"' EXIT

  . src/app/.env.test
  . dev/.env.test
  export DATABASE_URL=postgresql://postgres:$DATABASE_ADMIN_PASSWORD@localhost:$DATABASE_PORT
  (cd src/app && npx prisma migrate dev --name init)
  (cd src/app && npm test -- "$@")

prep-test-app: (test-environment "build") (test-environment "up" "--no-start") (test-environment "up" "-d")
  #!/usr/bin/env bash
  set -euxo pipefail
  . src/app/.env.test
  . dev/.env.test
  timeout 5 sh -c 'sleep 1; until nc -z $0 $1; do sleep 1; done' localhost $DATABASE_PORT

prep-dev-app: (dev-environment "build") (dev-environment "up" "--no-start") (dev-environment "up" "-d")
  #!/usr/bin/env bash
  set -euxo pipefail
  . src/app/.env.development
  . dev/.env.dev
  timeout 5 sh -c 'sleep 1; until nc -z $0 $1; do sleep 1; done' localhost $DATABASE_PORT

build-wasm: build-wasm-dev
  #!/usr/bin/env bash
  set -euxo pipefail
  optimize() {
    MY_TMP="$(mktemp)"
    trap 'rm -rf -- "$MY_TMP"' EXIT
    time -p wasm-opt -O2 "$1" -o "$MY_TMP"
    mv "$MY_TMP" "$1"
  }

  optimize src/wasm-compress/pkg/wasm_compress_bg.wasm &
  optimize src/wasm-ck3/pkg/wasm_ck3_bg.wasm &
  optimize src/wasm-eu4/pkg/wasm_eu4_bg.wasm &
  optimize src/wasm-hoi4/pkg/wasm_hoi4_bg.wasm &
  optimize src/wasm-imperator/pkg/wasm_imperator_bg.wasm &
  optimize src/wasm-vic3/pkg/wasm_vic3_bg.wasm &
  wait

build-wasm-dev:
  wasm-pack build -t web src/wasm-compress
  wasm-pack build -t web src/wasm-ck3
  wasm-pack build -t web src/wasm-eu4
  wasm-pack build -t web src/wasm-hoi4
  wasm-pack build -t web src/wasm-imperator
  wasm-pack build -t web src/wasm-vic3

build-napi:
  cargo build --release -p applib-node
  cp -f ./target/release/libapplib_node.so ./src/app/src/server-lib/applib.node

package-all *opts: admin-tokenize-all
  #!/usr/bin/env bash
  set -euxo pipefail
  package() {
    length=$(($#-1))
    array=${@:1:$length}
    ./target/release/pdx compile-assets ${array} "${@: -1}"
  }

  cargo build --release --package pdx --features compile_assets

  LAST_BUNDLE=$(ls assets/game-bundles/eu4-* | grep -v common | sort -n | tail -n1)
  for BUNDLE in $(ls assets/game-bundles/eu4-* | grep -v common | sort -n); do
    if [ "$BUNDLE" = "$LAST_BUNDLE" ]; then
      package "$@" "$BUNDLE"
    else
      package "$@" --skip-common "$BUNDLE"
    fi;
  done;

pdx cmd *args:
  cargo run --release --package pdx --features {{replace(cmd, "-", "_")}} -- "$@"

dev-environment +cmd:
  #!/usr/bin/env bash
  set -euxo pipefail
  MY_TMP="$(mktemp)"
  trap 'rm -rf -- "$MY_TMP"' EXIT
  cat src/app/.env.development ./dev/.env.dev >> "$MY_TMP"

  docker-compose -f ./dev/docker-compose.test.yml --env-file "$MY_TMP" --project-name pdx_dev "$@"

test-environment +cmd:
  #!/usr/bin/env bash
  set -euxo pipefail
  MY_TMP="$(mktemp)"
  trap 'rm -rf -- "$MY_TMP"' EXIT
  cat src/app/.env.test ./dev/.env.test >> "$MY_TMP"

  docker-compose -f ./dev/docker-compose.test.yml --env-file "$MY_TMP" --project-name pdx_test "$@"

deploy-db-schema ENVIRONMENT:
  #!/usr/bin/env bash
  set -euo pipefail
  . dev/.env.{{ENVIRONMENT}}
  export DATABASE_URL=postgresql://postgres:$DATABASE_ADMIN_PASSWORD@localhost:$DATABASE_EXPOSED_LOCAL_PORT
  (cd src/app && npx prisma migrate deploy)

backup ENVIRONMENT:
  backup-db {{ENVIRONMENT}}
  backup-leaderboard {{ENVIRONMENT}}
  backup-saves {{ENVIRONMENT}}
  backup-config {{ENVIRONMENT}}

backup-db ENVIRONMENT:
  ssh pdx-tools-{{ENVIRONMENT}} '/opt/pdx-tools/docker-compose.sh exec -T --user postgres db pg_dump --exclude-table=\*prisma\* --data-only' > db-{{ENVIRONMENT}}.dump
  ssh pdx-tools-{{ENVIRONMENT}} '/opt/pdx-tools/docker-compose.sh exec -T --user postgres db psql --command "\COPY saves TO STDOUT CSV HEADER"' > db-{{ENVIRONMENT}}-saves.csv

backup-saves ENVIRONMENT:
  #!/usr/bin/env bash
  set -euo pipefail
  . dev/.env.app.{{ENVIRONMENT}}

  export RCLONE_CONFIG_PDX_TYPE=s3
  export RCLONE_CONFIG_PDX_ACCESS_KEY_ID="$S3_ACCESS_KEY"
  export RCLONE_CONFIG_PDX_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
  export RCLONE_CONFIG_PDX_REGION="$S3_REGION"
  export RCLONE_CONFIG_PDX_ENDPOINT="${S3_ENDPOINT/https:\/\//}"

  rclone sync --no-gzip-encoding --backup-dir ./saves-archive "pdx:/$S3_BUCKET" ./saves

backup-config ENVIRONMENT:
  ssh pdx-tools-{{ENVIRONMENT}} 'tar -c -C /opt/pdx-tools .' > config-{{ENVIRONMENT}}.tar

admin-sync-assets:
  just pdx fetch-assets --access-key "${ASSETS_ACCESS_KEY}" --secret-key "${ASSETS_SECRET_KEY}"

admin-tokenize-all: (tokenize 
  "--eu4-ironman-tokens" "./assets/tokens/eu4.txt"
  "--ck3-ironman-tokens" "./assets/tokens/ck3.txt"
  "--hoi4-ironman-tokens" "./assets/tokens/hoi4.txt"
  "--imperator-tokens" "./assets/tokens/imperator.txt"
  "--vic3-tokens" "./assets/tokens/vic3.txt"
)

tokenize *cmd:
  cargo run --release --package pdx --features tokenize -- tokenize "$@"

format:
  cargo fmt
  cd src/app && npm run format
  cd src/docs && npm run format
  cd src/map && npx prettier@latest --write src

prep-frontend:
  #!/usr/bin/env bash
  set -euxo pipefail

  # Create empty token files for devs without them
  mkdir -p assets/tokens
  for game in "eu4" "ck3" "hoi4" "imperator" "vic3"; do
    touch -a assets/tokens/$game.bin assets/tokens/$game.txt
  done;

  OUTPUT=src/app/src/lib/game_gen.ts
  rm -f "$OUTPUT"

  readarray -t VERSIONS < <(ls assets/game/eu4/ | grep -v common | sort -n)

  echo "import type { ResourceUrls } from \"./url_types\"" >> "$OUTPUT"
  echo -n "export type GameVersion = \"${VERSIONS[0]}\"" >> "$OUTPUT"
  for VERSION in "${VERSIONS[@]:1}"; do
    echo -n " | \"$VERSION\"" >> "$OUTPUT"
  done;
  echo ";" >> "$OUTPUT";

  echo "export function gameVersion(x: string): GameVersion {" >> "$OUTPUT"
  echo "  switch (x) {" >> "$OUTPUT"
  for VERSION in "${VERSIONS[@]}"; do
    echo "    case \"$VERSION\":" >> "$OUTPUT";
  done;
  echo "      return x;" >> "$OUTPUT";
  echo "    default: return defaultVersion" >> "$OUTPUT";
  echo "  }" >> "$OUTPUT";
  echo "}" >> "$OUTPUT";

  echo "export const resources: { [index in GameVersion]: ResourceUrls } = {" >> "$OUTPUT"
  for VERSION in "${VERSIONS[@]}"; do
    cat >> "$OUTPUT" << EOF
    "$VERSION": {
      provinces1: require(\`../../../../assets/game/eu4/$VERSION/map/provinces-1.png\`),
      provinces2: require(\`../../../../assets/game/eu4/$VERSION/map/provinces-2.png\`),
      colorMap: require(\`../../../../assets/game/eu4/$VERSION/map/colormap_summer.webp\`),
      sea: require(\`../../../../assets/game/eu4/$VERSION/map/colormap_water.webp\`),
      normal: require(\`../../../../assets/game/eu4/$VERSION/map/world_normal.webp\`),
      terrain1: require(\`../../../../assets/game/eu4/$VERSION/map/terrain-1.png\`),
      terrain2: require(\`../../../../assets/game/eu4/$VERSION/map/terrain-2.png\`),
      rivers1: require(\`../../../../assets/game/eu4/$VERSION/map/rivers-1.png\`),
      rivers2: require(\`../../../../assets/game/eu4/$VERSION/map/rivers-2.png\`),
      stripes: require(\`../../../../assets/game/eu4/$VERSION/map/occupation.png\`),
      water: require(\`../../../../assets/game/eu4/$VERSION/map/noise-2d.webp\`),
      surfaceRock: require(\`../../../../assets/game/eu4/$VERSION/map/atlas0_rock.webp\`),
      surfaceGreen: require(\`../../../../assets/game/eu4/$VERSION/map/atlas0_green.webp\`),
      surfaceNormalRock: require(\`../../../../assets/game/eu4/$VERSION/map/atlas_normal0_rock.webp\`),
      surfaceNormalGreen: require(\`../../../../assets/game/eu4/$VERSION/map/atlas_normal0_green.webp\`),
      heightmap: require(\`../../../../assets/game/eu4/$VERSION/map/heightmap.webp\`),
      provincesUniqueColor: require(\`../../../../assets/game/eu4/$VERSION/map/color-order.bin\`),
      provincesUniqueIndex: require(\`../../../../assets/game/eu4/$VERSION/map/color-index.bin\`),
    },
  EOF

  done;
  echo "}" >> "$OUTPUT"
  echo export const defaultVersion = \"$VERSION\" >> "$OUTPUT";

  echo "export const dataUrls: { [index in GameVersion]: string } = {" >> "$OUTPUT"
  for VERSION in "${VERSIONS[@]}"; do
    cat >> "$OUTPUT" << EOF
    "$VERSION": require(\`../../../../assets/game/eu4/$VERSION/data.bin\`),
  EOF
  done;
  echo "}" >> "$OUTPUT"

