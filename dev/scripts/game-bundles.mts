#!/usr/bin/env node

// Keep assets/game-bundles in agreement with assets/catalog.json. The
// bucket stores each bundle by name and checksum, for example
// eu5-1.4-<sha256>.zip. Thus, an upload adds an object and does not
// change an object that another branch uses.
//
//   sync     Download the bundles that the catalog lists, then check them.
//   publish  Upload the catalog bundles and write their checksums.

import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { link, mkdir, mkdtemp, readdir, rename, rm, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  type AssetRelease,
  catalogPath,
  readAssetCatalog,
  serializeAssetCatalog,
} from "./asset-catalog.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const bundlesDir = join(projectRoot, "assets", "game-bundles");
const remoteDir = ":s3:pdx-tools-build/game-bundles";

/** Object name in the bucket for a release bundle */
const remoteName = (release: AssetRelease) =>
  release.bundle.replace(/\.zip$/, `-${release.sha256}.zip`);

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

const localHash = (release: AssetRelease) =>
  hashFile(join(bundlesDir, release.bundle)).catch(() => "missing");

/** Run fn with a temporary directory in bundlesDir, so rename and link work */
const withStagingDir = async <T,>(fn: (dir: string) => Promise<T>) => {
  await mkdir(bundlesDir, { recursive: true });
  const dir = await mkdtemp(join(bundlesDir, ".staging-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
};

const sync = async () => {
  const catalog = await readAssetCatalog();
  const releases = Object.values(catalog.games).flatMap((game) =>
    game.releases.filter((release) => release.sha256),
  );

  // Download only the bundles that are missing or different. The CI cache
  // can supply bundles from a different catalog.
  const stale: AssetRelease[] = [];
  for (const release of releases) {
    if ((await localHash(release)) !== release.sha256) stale.push(release);
  }

  if (stale.length > 0) {
    await withStagingDir(async (dir) => {
      const listPath = join(dir, "files.txt");
      await writeFile(listPath, stale.map(remoteName).join("\n"));
      rclone(
        ["copy", "--files-from", listPath, remoteDir, dir],
        process.env.ASSETS_ACCESS_KEY ?? process.env.ASSETS_UPLOAD_ACCESS_KEY,
        process.env.ASSETS_SECRET_KEY ?? process.env.ASSETS_UPLOAD_SECRET_KEY,
      );
      for (const release of stale) {
        await rename(join(dir, remoteName(release)), join(bundlesDir, release.bundle)).catch(
          () => {},
        );
      }
    });
  }

  const failures: string[] = [];
  for (const release of stale) {
    const actual = await localHash(release);
    if (actual !== release.sha256) {
      failures.push(`${release.bundle}: expected ${release.sha256}, found ${actual}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `These bundles are not the same as the catalog:\n${failures.join("\n")}\n` +
        "If the bucket does not have a bundle, run mise run admin:assets:publish where the bundle was made",
    );
  }
  console.log(`All ${releases.length} game bundles agree with the catalog`);
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

  // Link each bundle to its object name. The bucket can already have an
  // object with this name. Its content is then the same, so do not upload it.
  await withStagingDir(async (dir) => {
    for (const release of releases) {
      await link(join(bundlesDir, release.bundle), join(dir, remoteName(release)));
    }
    rclone(
      ["copy", "--ignore-existing", dir, remoteDir],
      process.env.ASSETS_UPLOAD_ACCESS_KEY,
      process.env.ASSETS_UPLOAD_SECRET_KEY,
    );
  });
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
