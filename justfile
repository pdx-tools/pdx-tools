set dotenv-load := true
set positional-arguments

release:
  #!/usr/bin/env bash
  set -euxo pipefail
  export PDX_RELEASE=1
  export NEXT_PUBLIC_EXTERNAL_ADDRESS=https://pdx.tools
  export NEXT_PUBLIC_POSTHOG_KEY=$POSTHOG_KEY

  if [[ "$(gcloud config get-value account 2>&1)" = "(unset)" ]]; then
    gcloud auth login
  fi
  gcloud auth configure-docker us-west1-docker.pkg.dev

  if [[ $(git status --porcelain --untracked-files=no) ]]; then
    echo "Address uncommitted changes before release"
    exit 1
  fi

  just build
  just publish-app
  just publish-api

  if [[ $(grep -c pdx-tools-prod ~/.ssh/config || echo "0") -gt 0 ]]; then
    just publish-backend
  else
    echo "pdx-tools-prod not found in ssh config, please add it and then run just publish-backend"
  fi

build: build-wasm build-app (cross "--package" "pdx-tools-api" "--release") build-docker

dev: build-wasm-dev dev-app

staging: build-app prep-dev-app
  #!/usr/bin/env bash
  set -euxo pipefail
  cd src/app
  . .env.production
  PORT=3001 node_modules/.bin/next start

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
  (cd src/map && npm ci)

publish-api:
  docker tag ghcr.io/pdx-tools/api:nightly us-west1-docker.pkg.dev/$GCLOUD_PROJECT/docker/api:nightly
  docker push us-west1-docker.pkg.dev/$GCLOUD_PROJECT/docker/api:nightly
  gcloud run deploy api --region=us-west2 --project=$GCLOUD_PROJECT --image=us-west1-docker.pkg.dev/$GCLOUD_PROJECT/docker/api:nightly

publish-backend:
  docker image save ghcr.io/pdx-tools/pdx-tools:nightly | gzip | ssh pdx-tools-prod 'docker load && pdx-tools/docker-compose.sh up -d app'

publish-app:
  #!/usr/bin/env bash
  set -euxo pipefail
  export PDX_RELEASE=1
  export VITE_EXTERNAL_ADDRESS=$EXTERNAL_ADDRESS
  export VITE_SENTRY_DSN=$SENTRY_DSN
  just build-app
  cd src/app
  find build/ -iname "*.map" -delete
  npm run deploy

build-app: prep-frontend
  cd src/docs && npm run build
  cd src/docs/build && cp -r assets blog.html changelog.html docs.html img ../../app/public/.
  cd src/app && npm run build
  cp src/app/app/server-lib/wasm/wasm_app_bg.wasm src/app/build/server/assets/.

build-docker:
  #!/usr/bin/env bash
  set -euxo pipefail
  docker build -t ghcr.io/pdx-tools/api:nightly -f ./dev/api.dockerfile ./target/x86_64-unknown-linux-musl/release/

build-admin:
  just cross --package pdx --features admin --release

cargo *cmd:
  cargo "$@"

cross *cmd:
  #!/usr/bin/env bash
  set -euxo pipefail
  if [[ "${REMOTE_CONTAINERS:-}" == "true" ]]; then
    # If we're within the dev container then we need to use special cross within
    # docker instructions, and workaround how the devcontainer uses "host"
    # networking so `hostname` doesn't return the name of the container.
    export HOSTNAME=$(docker ps | grep vsc-pdx-tools | cut -d' ' -f 1)
  elif [[ -n "${GH_PAT:-}" ]]; then
    export HOSTNAME=$(docker ps | tail -n1 | cut -d' ' -f 1)
  fi
  cross build --target x86_64-unknown-linux-musl "$@"

dev-app: prep-frontend prep-dev-app
  #!/usr/bin/env bash
  set -euxo pipefail
  . src/app/.env.development
  . dev/.env.dev
  cat src/app/migrations/*.sql | just dev-environment exec -u postgres --no-TTY db psql

  export WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_PDX_DB="postgresql://$DATABASE_USER:$DATABASE_PASSWORD@localhost:$DATABASE_PORT/postgres"
  npx --yes concurrently@latest \
    "cd src/app && PORT=3001 npm run dev" \
    "cd src/docs && npm run docusaurus -- start --no-open" \
    "PORT=$PARSE_API_PORT just cargo run -p pdx-tools-api"

test-app *cmd: prep-frontend prep-test-app
  #!/usr/bin/env bash
  set -euxo pipefail

  . src/app/.env.test
  . dev/.env.test
  just cargo build -p pdx-tools-api
  cat src/app/migrations/*.sql | just test-environment exec -u postgres --no-TTY db psql
  mkdir -p src/app/build/client

  export WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_PDX_DB="postgresql://$DATABASE_USER:$DATABASE_PASSWORD@localhost:$DATABASE_PORT/postgres"
  cd src/app && npx --yes concurrently@latest --kill-others --success command-1 --passthrough-arguments \
    "PORT=$PARSE_API_PORT just cargo run -p pdx-tools-api" \
    "npm test -- run {@}" -- "$@"

prep-test-app: (test-environment "build") (test-environment "up" "--no-start") (test-environment "up" "-d")
  #!/usr/bin/env bash
  set -euxo pipefail
  CONTAINER=$(just test-environment ps -q db)
  timeout 5 sh -c 'until docker exec $0 pg_isready; do sleep 0.5; done' $CONTAINER

prep-dev-app: (dev-environment "build") (dev-environment "up" "--no-start") (dev-environment "up" "-d")
  #!/usr/bin/env bash
  set -euxo pipefail
  CONTAINER=$(just dev-environment ps -q db)
  timeout 5 sh -c 'until docker exec $0 pg_isready; do sleep 0.5; done' $CONTAINER

build-wasm: build-wasm-dev
  #!/usr/bin/env bash
  set -euxo pipefail
  optimize() {
    MY_TMP="$(mktemp)"
    trap 'rm -rf -- "$MY_TMP"' EXIT
    time -p wasm-opt -O2 "$1" -o "$MY_TMP"
    mv "$MY_TMP" "$1"
  }

  optimize src/app/app/server-lib/wasm/wasm_app_bg.wasm &
  optimize src/wasm-compress/pkg/wasm_compress_bg.wasm &
  optimize src/wasm-ck3/pkg/wasm_ck3_bg.wasm &
  optimize src/wasm-eu4/pkg/wasm_eu4_bg.wasm &
  optimize src/wasm-hoi4/pkg/wasm_hoi4_bg.wasm &
  optimize src/wasm-imperator/pkg/wasm_imperator_bg.wasm &
  optimize src/wasm-vic3/pkg/wasm_vic3_bg.wasm &
  wait

build-wasm-dev:
  wasm-pack build -t web src/wasm-app --out-dir {{justfile_directory()}}/src/app/app/server-lib/wasm
  wasm-pack build -t web src/wasm-compress
  wasm-pack build -t web src/wasm-ck3
  wasm-pack build -t web src/wasm-eu4
  wasm-pack build -t web src/wasm-hoi4
  wasm-pack build -t web src/wasm-imperator
  wasm-pack build -t web src/wasm-vic3

package-all *opts:
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
  cd dev
  docker compose -f ./docker-compose.dev.yml --env-file ../src/app/.env.development --env-file ../src/app/.dev.vars --env-file .env.dev --project-name pdx_dev "$@"

test-environment +cmd:
  #!/usr/bin/env bash
  set -euxo pipefail
  cd dev
  docker compose -f ./docker-compose.test.yml --env-file ../src/app/.env.test --env-file ../src/app/.dev.vars.test --env-file .env.test --project-name pdx_test "$@"

deploy-db-schema ENVIRONMENT:
  #!/usr/bin/env bash
  set -euo pipefail
  . dev/.env.{{ENVIRONMENT}}
  cd src/app
  npx drizzle-kit generate:pg --schema src/server-lib/db/schema.ts --out migrations

  DATABASE_URL=postgresql://postgres:$DATABASE_ADMIN_PASSWORD@localhost:$DATABASE_EXPOSED_LOCAL_PORT
  echo npx drizzle-kit push:pg --verbose --driver pg --schema src/server-lib/db/schema.ts --connectionString "$DATABASE_URL"
  echo Execute the above to migrate a given database but probably better to just copy and paste the migration sql into the database.

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

admin-sync-tokens:
  #!/usr/bin/env bash
  set -euo pipefail
  rm -rf assets/tokens
  git clone https://${GH_PAT:+"$GH_PAT@"}github.com/pdx-tools/tokens.git assets/tokens
  (cd assets/tokens && ln -s tokens/* .)
  just admin-tokenize-all

admin-sync-assets: admin-sync-tokens
  rclone --verbose --s3-provider=AWS --s3-endpoint s3.us-west-002.backblazeb2.com --s3-secret-access-key="${ASSETS_SECRET_KEY}" --s3-access-key-id="${ASSETS_ACCESS_KEY}" copy :s3:pdx-tools-build/game-bundles assets/game-bundles/.

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

  # Generate empty image folders otherwise next.js goes into an infinite loop
  grep '^assets/game/eu4/common/images' .gitignore | grep -v '*' | \
  while IFS= read -r folder; do
    mkdir -p "$folder"
  done;

  # Copy over the REB flag which is the only one that is statically imported
  cp assets/game/eu4/common/images/{REB.png,flags/.}

  # Generate typescript types from rust code
  just cargo run -p applib --bin types

  # Create empty token files for devs without them
  mkdir -p assets/tokens
  for game in "eu4" "ck3" "hoi4" "imperator" "vic3"; do
    touch -a assets/tokens/$game.bin assets/tokens/$game.txt
  done;

  # Create DLC spritesheet
  cd src/app/app/features/eu4/components/dlc-list
  N=$(ls dlc-images | wc -l)
  COLS=$(echo $N | awk '{s=sqrt($0); print s == int(s) ? s : int(s) + 1}')
  montage -tile ${COLS}x -background transparent -define webp:lossless=true -mode concatenate "dlc-images/*" dlc-sprites.webp
  while IFS= read -r item; do echo "${item%%.*}"; done < <(ls dlc-images/) | \
    jq --compact-output --raw-input --null-input \
      '[inputs] | to_entries | map({(.value): .key}) | add' > dlc-sprites.json
  cd -

  # Create icons spritesheet
  cd src/app/app/features/eu4/components/icons
  N=$(ls *.png | wc -l)
  COLS=$(echo $N | awk '{s=sqrt($0); print s == int(s) ? s : int(s) + 1}')
  montage -tile ${COLS}x -mode concatenate -geometry '32x32>' -background transparent *.png icons.webp
  while IFS= read -r item; do echo "${item%%.*}"; done < <(ls *.png) |
    sed -e 's/icon_//g' | \
    jq --compact-output --raw-input --null-input \
      '[inputs] | to_entries | map({(.value): .key}) | add' > icons.json
  cd -

  # Create dummy spritesheets files if they don't exist for those who don't have
  # EU4 game data, otherwise dynamic imports will cause next.js failure
  mkdir -p assets/game/eu4/common/images/{achievements,advisors,buildings,flags,personalities,tc-investments}
  touch -a assets/game/eu4/common/images/achievements/achievements.webp
  touch -a assets/game/eu4/common/images/advisors/advisors_x{48,64,77}.webp
  touch -a assets/game/eu4/common/images/buildings/{global.webp,westerngfx.webp}
  touch -a assets/game/eu4/common/images/flags/flags_x{8,48,64,128}.webp
  touch -a assets/game/eu4/common/images/personalities/personalities.webp
  touch -a assets/game/eu4/common/images/tc-investments/investments.webp

  function create_file_if_empty() {
    [ ! -f "$1" ] || [ ! -s "$1" ] && echo "{}" > "$1" || echo "..."
  }

  JSON_FILES=(
    achievements/achievements.json
    advisors/advisors.json
    buildings/global.json
    buildings/westerngfx.json
    flags/flags.json
    personalities/personalities.json
    tc-investments/investments.json
  )
  for FILE in "${JSON_FILES[@]}"; do
    create_file_if_empty "assets/game/eu4/common/images/$FILE"
  done;

  # Generate EU4 game asset hooks
  OUTPUT=src/app/app/lib/game_gen.ts
  rm -f "$OUTPUT"

  readarray -t VERSIONS < <(ls assets/game/eu4/ | grep -v common | sort -n)
  if [[ "${#VERSIONS[@]}" == '0' ]]; then
    echo "const msg = 'EU4 assets not found, have you forgot to compile assets';" >> $"$OUTPUT"
    echo "export const gameVersion = (x: string): any => { throw new Error(msg); } " >> "$OUTPUT"
    echo "export const resources = (x: any): any => { throw new Error(msg); }" >> "$OUTPUT"
    echo "export const dataUrls = (x: any): any => { throw new Error(msg); }" >> "$OUTPUT"
    exit
  fi

  for VERSION in "${VERSIONS[@]}"; do
    MINOR=$(echo "$VERSION" | cut -d '.' -f 2)
    cat >> "$OUTPUT" << EOF
      import provinces1$MINOR from "../../../../assets/game/eu4/$VERSION/map/provinces-1.webp";
      import provinces2$MINOR from "../../../../assets/game/eu4/$VERSION/map/provinces-2.webp";
      import colorMap$MINOR from "../../../../assets/game/eu4/$VERSION/map/colormap_summer.webp";
      import sea$MINOR from "../../../../assets/game/eu4/$VERSION/map/colormap_water.webp";
      import normal$MINOR from "../../../../assets/game/eu4/$VERSION/map/world_normal.webp";
      import terrain1$MINOR from "../../../../assets/game/eu4/$VERSION/map/terrain-1.webp";
      import terrain2$MINOR from "../../../../assets/game/eu4/$VERSION/map/terrain-2.webp";
      import rivers1$MINOR from "../../../../assets/game/eu4/$VERSION/map/rivers-1.webp";
      import rivers2$MINOR from "../../../../assets/game/eu4/$VERSION/map/rivers-2.webp";
      import stripes$MINOR from "../../../../assets/game/eu4/$VERSION/map/occupation.webp";
      import water$MINOR from "../../../../assets/game/eu4/$VERSION/map/noise-2d.webp";
      import surfaceRock$MINOR from "../../../../assets/game/eu4/$VERSION/map/atlas0_rock.webp";
      import surfaceGreen$MINOR from "../../../../assets/game/eu4/$VERSION/map/atlas0_green.webp";
      import surfaceNormalRock$MINOR from "../../../../assets/game/eu4/$VERSION/map/atlas_normal0_rock.webp";
      import surfaceNormalGreen$MINOR from "../../../../assets/game/eu4/$VERSION/map/atlas_normal0_green.webp";
      import heightmap$MINOR from "../../../../assets/game/eu4/$VERSION/map/heightmap.webp";
      import provincesUniqueColor$MINOR from "../../../../assets/game/eu4/$VERSION/map/color-order.bin?url";
      import provincesUniqueIndex$MINOR from "../../../../assets/game/eu4/$VERSION/map/color-index.bin?url";
      import data$MINOR from "../../../../assets/game/eu4/$VERSION/data.bin?url";
  EOF
  done;

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

  echo "export const resources = (x: GameVersion): ResourceUrls => {" >> "$OUTPUT"
  echo "  switch(x) {" >> "$OUTPUT"
  for VERSION in "${VERSIONS[@]}"; do
    MINOR=$(echo "$VERSION" | cut -d '.' -f 2)
    cat >> "$OUTPUT" << EOF
    case "$VERSION": return {
      provinces1: provinces1$MINOR,
      provinces2: provinces2$MINOR,
      colorMap: colorMap$MINOR,
      sea: sea$MINOR,
      normal: normal$MINOR,
      terrain1: terrain1$MINOR,
      terrain2: terrain2$MINOR,
      rivers1: rivers1$MINOR,
      rivers2: rivers2$MINOR,
      stripes: stripes$MINOR,
      water: water$MINOR,
      surfaceRock: surfaceRock$MINOR,
      surfaceGreen: surfaceGreen$MINOR,
      surfaceNormalRock: surfaceNormalRock$MINOR,
      surfaceNormalGreen: surfaceNormalGreen$MINOR,
      heightmap: heightmap$MINOR,
      provincesUniqueColor: provincesUniqueColor$MINOR,
      provincesUniqueIndex: provincesUniqueIndex$MINOR,
    }
  EOF

  done;
  echo "}}" >> "$OUTPUT"
  echo export const defaultVersion = \"$VERSION\" >> "$OUTPUT";

  echo "export const dataUrls = (x: GameVersion): string => {" >> "$OUTPUT"
  echo "  switch(x) {" >> "$OUTPUT"
  for VERSION in "${VERSIONS[@]}"; do
    MINOR=$(echo "$VERSION" | cut -d '.' -f 2)
    cat >> "$OUTPUT" << EOF
    case "$VERSION": return data$MINOR
  EOF
  done;
  echo "}}" >> "$OUTPUT"

