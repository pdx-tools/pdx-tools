#!/usr/bin/env node

// Keep assets/game-bundles in agreement with assets/catalog.json. The
// bucket stores each bundle by name.
//
//   sync     Download the bundles that the catalog lists, then check them.
//   publish  Upload the catalog bundles and write their checksums.

import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { catalogPath, readAssetCatalog, serializeAssetCatalog } from "./asset-catalog.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const bundlesDir = join(projectRoot, "assets", "game-bundles");
const remoteDir = ":s3:pdx-tools-build/game-bundles-v2";

const rclone = (args: string[], accessKey?: string, secretKey?: string) => {
  if (!accessKey || !secretKey) {
    throw new Error("Set the bucket access keys in .env or the environment");
  }
  const result = spawnSync("rclone", ["--verbose", ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      RCLONE_S3_PROVIDER: "AWS",
      RCLONE_S3_ENDPOINT: "s3.us-west-002.backblazeb2.com",
      RCLONE_S3_ACCESS_KEY_ID: accessKey,
      RCLONE_S3_SECRET_ACCESS_KEY: secretKey,
      RCLONE_S3_NO_CHECK_BUCKET: "true",
    },
  });
  if (result.status !== 0) throw new Error(`rclone ${args[0]} failed`);
};

const hashFile = async (path: string) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
};

const sync = async () => {
  const catalog = await readAssetCatalog();
  const manifest = Object.values(catalog.games).flatMap((game) =>
    game.releases
      .filter((release) => release.sha256)
      .map((release) => ({
        sha256: release.sha256,
        name: release.bundle,
      })),
  );

  // --checksum skips a file only when it is the same as the remote file.
  const listDir = await mkdtemp(join(tmpdir(), "game-bundles-"));
  try {
    const listPath = join(listDir, "files.txt");
    await writeFile(listPath, manifest.map(({ name }) => name).join("\n"));
    rclone(
      ["copy", "--checksum", "--files-from", listPath, remoteDir, bundlesDir],
      process.env.ASSETS_ACCESS_KEY ?? process.env.ASSETS_UPLOAD_ACCESS_KEY,
      process.env.ASSETS_SECRET_KEY ?? process.env.ASSETS_UPLOAD_SECRET_KEY,
    );
  } finally {
    await rm(listDir, { force: true, recursive: true });
  }

  const failures: string[] = [];
  for (const { sha256, name } of manifest) {
    const actual = await hashFile(join(bundlesDir, name)).catch(() => "missing");
    if (actual !== sha256) failures.push(`${name}: expected ${sha256}, found ${actual}`);
  }
  if (failures.length > 0) {
    throw new Error(
      `These bundles are not the same as the catalog:\n${failures.join("\n")}\n` +
        "If the bucket has a different bundle, run mise run admin:assets:publish where the bundle was made",
    );
  }
  console.log(`All ${manifest.length} game bundles agree with the catalog`);
};

const publish = async () => {
  const catalog = await readAssetCatalog();
  const releases = Object.values(catalog.games).flatMap((game) => game.releases);
  const names = (await readdir(bundlesDir)).filter((name) => name.endsWith(".zip"));
  for (const name of names) {
    if (!releases.some((release) => release.bundle === name)) {
      throw new Error(`Bundle ${name} has no catalog release`);
    }
  }
  for (const release of releases) {
    if (!names.includes(release.bundle)) throw new Error(`Missing bundle: ${release.bundle}`);
    release.sha256 = await hashFile(join(bundlesDir, release.bundle));
  }

  rclone(
    ["copy", "--checksum", "--include", "*.zip", bundlesDir, remoteDir],
    process.env.ASSETS_UPLOAD_ACCESS_KEY,
    process.env.ASSETS_UPLOAD_SECRET_KEY,
  );
  await writeFile(catalogPath, serializeAssetCatalog(catalog));
  console.log("Updated assets/catalog.json. Commit it with your change");
};

const command = process.argv[2];
try {
  if (command === "sync") await sync();
  else if (command === "publish") await publish();
  else {
    console.error("Usage: game-bundles.mts sync | publish");
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
