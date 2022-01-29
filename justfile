set dotenv-load := true

export EU4_IRONMAN_TOKENS := `pwd | xargs printf "%s/assets/tokens/eu4.txt"`
export HOI4_IRONMAN_TOKENS := `pwd | xargs printf "%s/assets/tokens/hoi4.txt"`
export CK3_IRONMAN_TOKENS := `pwd | xargs printf "%s/assets/tokens/ck3.txt"`
export IMPERATOR_TOKENS := `pwd | xargs printf "%s/assets/tokens/imperator.txt"`

build: touch-tokens build-wasm build-napi build-app build-docker

build-rust:
  cargo build --all

dev: touch-tokens build-wasm-dev build-napi dev-app
  
publish: publish-backend publish-frontend

test: touch-tokens test-rust test-app

setup:
  #!/usr/bin/env bash
  set -euxo pipefail
  MY_TMP="$(mktemp -d)"
  trap 'rm -rf -- "$MY_TMP"' EXIT
    
  npm install -g wasm-pack@0.10.1
  npm install -g @cloudflare/wrangler

  HUGO_V=0.91.2
  curl -o "$MY_TMP/hugo.deb" -L "https://github.com/gohugoio/hugo/releases/download/v${HUGO_V}/hugo_extended_${HUGO_V}_Linux-64bit.deb"
  sudo dpkg -i "$MY_TMP/hugo.deb"

  WASM_OPT_V=version_105
  curl -o "$MY_TMP/binaryen.tar.gz" -L "https://github.com/WebAssembly/binaryen/releases/download/${WASM_OPT_V}/binaryen-${WASM_OPT_V}-x86_64-linux.tar.gz"
  (cd "$MY_TMP" && tar -xzf "binaryen.tar.gz")
  sudo mv "$MY_TMP/binaryen-$WASM_OPT_V/bin/wasm-opt" "/usr/local/bin/."

  curl -o "$MY_TMP/flatc.zip" -L "https://github.com/google/flatbuffers/releases/download/v2.0.0/Linux.flatc.binary.clang++-9.zip"
  (cd "$MY_TMP" && unzip flatc.zip)
  chmod +x "$MY_TMP/flatc"
  sudo mv "$MY_TMP/flatc" "/usr/local/bin/."

  (cd "src/app" && npm ci)

publish-backend:
  docker push docker.nbsoftsolutions.com/pdx-tools/app
  ssh -t pdx-tools-prod '/opt/pdx-tools/docker-compose.sh pull api && /opt/pdx-tools/docker-compose.sh up -d api'

wrangler +cmd:
  cd src/app && wrangler {{cmd}}

publish-frontend: (wrangler "publish")

build-app: prep-frontend
  cd src/app && npm run build

touch-tokens:
  # Create dummy token files so that one can still test
  # plain text saves
  touch "$EU4_IRONMAN_TOKENS"
  touch "$HOI4_IRONMAN_TOKENS"
  touch "$CK3_IRONMAN_TOKENS"
  touch "$IMPERATOR_TOKENS"

build-docker:
  docker build -t docker.nbsoftsolutions.com/pdx-tools/app -f ./dev/app.dockerfile ./src/app

build-admin:
   cargo build --release -p admin-cli

test-rust *cmd:
  cargo test {{cmd}}

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
  (cd src/app && npm test -- {{cmd}})

prep-test-app: (test-environment "up --no-start") (test-environment "up -d")
  #!/usr/bin/env bash
  set -euxo pipefail
  . src/app/.env.test
  . dev/.env.test
  timeout 5 sh -c 'sleep 1; until nc -z $0 $1; do sleep 1; done' localhost $DATABASE_PORT

prep-dev-app: (dev-environment "up --no-start") (dev-environment "up -d")
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

package-all: touch-tokens
  #!/usr/bin/env bash
  set -euxo pipefail
  package() {
    length=$(($#-1))
    array=${@:1:$length}
    cargo run --release -p packager --bin run_tar -- ${array} assets/game-bundles/eu4-"${@: -1}".tar.zst
  }

  cargo build --release -p packager --bin run_tar
  package 1.29 &
  package 1.30 &
  package 1.31 &
  package --common 1.32 &
  wait

asset-extraction +cmd: touch-tokens
  cargo run --release -p packager --bin asset_extraction -- --common {{cmd}} 

dev-environment +cmd:
  #!/usr/bin/env bash
  set -euxo pipefail
  MY_TMP="$(mktemp)"
  trap 'rm -rf -- "$MY_TMP"' EXIT
  cat src/app/.env.development ./dev/.env.dev >> "$MY_TMP"

  docker-compose -f ./dev/docker-compose.test.yml -f ./dev/docker-compose.dev.yml --env-file "$MY_TMP" --project-name pdx_dev {{cmd}}

test-environment +cmd:
  #!/usr/bin/env bash
  set -euxo pipefail
  MY_TMP="$(mktemp)"
  trap 'rm -rf -- "$MY_TMP"' EXIT
  cat src/app/.env.test ./dev/.env.test >> "$MY_TMP"

  docker-compose -f ./dev/docker-compose.test.yml --env-file "$MY_TMP" --project-name pdx_test {{cmd}}

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

backup-db ENVIRONMENT:
  ssh -t pdx-tools-{{ENVIRONMENT}} '/opt/pdx-tools/docker-compose.sh exec --user postgres db pg_dump --exclude-table=\*prisma\* --data-only' > db-{{ENVIRONMENT}}.dump
  ssh -t pdx-tools-{{ENVIRONMENT}} '/opt/pdx-tools/docker-compose.sh exec --user postgres db psql --command "\COPY saves TO STDOUT CSV HEADER"' > db-{{ENVIRONMENT}}-saves.csv

backup-leaderboard ENVIRONMENT:
  ssh -t pdx-tools-{{ENVIRONMENT}} '/opt/pdx-tools/docker-compose.sh exec redis cat dump.rdb' > leaderboard-{{ENVIRONMENT}}.rdb

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

admin-sync-assets:
  cargo build --release -p assets
  ACCESS_KEY="${ASSETS_ACCESS_KEY}" SECRET_KEY="${ASSETS_SECRET_KEY}" ./target/release/assets sync-assets

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
    provinces: require(\`../../../../assets/game/eu4/$VERSION/map/provinces.png\`),
    colorMap: require(\`../../../../assets/game/eu4/$VERSION/map/colormap_summer.webp\`),
    sea: require(\`../../../../assets/game/eu4/$VERSION/map/colormap_water.webp\`),
    normal: require(\`../../../../assets/game/eu4/$VERSION/map/world_normal.webp\`),
    terrain: require(\`../../../../assets/game/eu4/$VERSION/map/terrain.png\`),
    rivers: require(\`../../../../assets/game/eu4/$VERSION/map/rivers.png\`),
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
