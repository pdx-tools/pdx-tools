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

build: build-wasm build-napi build-app build-docker

build-rust:
  cargo build --all

dev: build-wasm-dev build-napi dev-app
  
publish: publish-backend publish-frontend

test: (cargo "test" "--all-features") test-app

setup:
  #!/usr/bin/env bash
  set -euxo pipefail

  ./.devcontainer/library-scripts/npm-dependencies.sh
  sudo ./.devcontainer/library-scripts/dependencies.sh
  (cd "src/app" && npm ci)

publish-backend:
  docker push docker.nbsoftsolutions.com/pdx-tools/app
  ssh -t pdx-tools-prod '/opt/pdx-tools/docker-compose.sh pull api && /opt/pdx-tools/docker-compose.sh up -d api'

wrangler +cmd:
  cd src/app && wrangler "$@"

publish-frontend: (wrangler "publish")
publish-frontend-dev: (wrangler "publish" "--env" "dev")

build-app: prep-frontend
  cd src/app && npm run build

build-docker:
  docker build -t docker.nbsoftsolutions.com/pdx-tools/app -f ./dev/app.dockerfile ./src/app

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

  PORT=3001 src/app/node_modules/.bin/next dev src/app

test-app *cmd: prep-test-app
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

  optimize src/wasm-br/pkg/wasm_br_bg.wasm &
  optimize src/wasm-ck3/pkg/wasm_ck3_bg.wasm &
  optimize src/wasm-eu4/pkg/wasm_eu4_bg.wasm &
  optimize src/wasm-hoi4/pkg/wasm_hoi4_bg.wasm &
  optimize src/wasm-imperator/pkg/wasm_imperator_bg.wasm &
  wait

build-wasm-dev:
  wasm-pack build -t web src/wasm-br
  wasm-pack build -t web src/wasm-ck3
  wasm-pack build -t web src/wasm-detect
  wasm-pack build -t web src/wasm-eu4
  wasm-pack build -t web src/wasm-hoi4
  wasm-pack build -t web src/wasm-imperator

build-napi:
  cargo build --release -p applib-node
  cp -f ./target/release/libapplib_node.so ./src/app/src/server-lib/applib.node

package-all *opts: admin-tokenize
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
      package "$@" "$BUNDLE" &
    else
      package "$@" --skip-common "$BUNDLE" &
    fi;
  done;

  wait

pdx cmd *args:
  cargo run --release --package pdx --features {{replace(cmd, "-", "_")}} -- "$@"

dev-environment +cmd:
  #!/usr/bin/env bash
  set -euxo pipefail
  MY_TMP="$(mktemp)"
  trap 'rm -rf -- "$MY_TMP"' EXIT
  cat src/app/.env.development ./dev/.env.dev >> "$MY_TMP"

  docker-compose -f ./dev/docker-compose.test.yml -f ./dev/docker-compose.dev.yml --env-file "$MY_TMP" --project-name pdx_dev "$@"

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

backup-leaderboard ENVIRONMENT:
  ssh pdx-tools-{{ENVIRONMENT}} '/opt/pdx-tools/docker-compose.sh exec -T redis cat dump.rdb' > leaderboard-{{ENVIRONMENT}}.rdb

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

admin-tokenize *cmd:
  cargo run --release --package pdx --features tokenize -- tokenize \
    --eu4-ironman-tokens "./assets/tokens/eu4.txt" \
    --ck3-ironman-tokens "./assets/tokens/ck3.txt" \
    --hoi4-ironman-tokens "./assets/tokens/hoi4.txt" \
    --imperator-tokens "./assets/tokens/imperator.txt" \
     "$@"

format:
  cargo fmt
  cd src/app && npm run format
  cd src/map && npx prettier@latest --write src

prep-frontend:
  #!/usr/bin/env bash
  set -euxo pipefail

  mkdir -p src/app/src/map && cp src/map/src/* src/app/src/map/.

  # Auto generate URLs for game data and resource files. We split them into two
  # files as one called from a web worker while the other is on the UI thread
  # and webpack errors with:
  #   "The "path" argument must be of type string. Received undefined
  # Solution appears to ensure that the web worker and main app don't intersect
  # with local imports

  RESOURCE_OUTPUT=src/app/src/lib/url_gen.ts
  DATA_OUTPUT=src/app/src/lib/data_gen.ts
  rm -f "$RESOURCE_OUTPUT"
  rm -f "$DATA_OUTPUT"

  echo "import type { ResourceUrls } from \"./url_types\"" >> "$RESOURCE_OUTPUT"
  echo "export const resources: Record<string, ResourceUrls> = {" >> "$RESOURCE_OUTPUT"

  echo "import type { DataUrls } from \"./url_types\"" >> "$DATA_OUTPUT"
  echo "export const dataUrls: Record<string, DataUrls> = {" >> "$DATA_OUTPUT"

  for VERSION in $(ls assets/game/eu4/ | grep -v common | sort -n); do
    cat >> "$RESOURCE_OUTPUT" << EOF
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

  cat >> "$DATA_OUTPUT" << EOF
  "$VERSION": {
    data: require(\`../../../../assets/game/eu4/$VERSION/data.bin\`),
    provinceIndices: require(\`../../../../assets/game/eu4/$VERSION/provinces-indices.bin\`),
  },
  EOF

  done;
  echo "}" >> "$RESOURCE_OUTPUT"
  echo export const defaultVersion = \"$VERSION\" >> "$RESOURCE_OUTPUT";

  echo "}" >> "$DATA_OUTPUT"
  echo export const defaultVersion = \"$VERSION\" >> "$DATA_OUTPUT";
