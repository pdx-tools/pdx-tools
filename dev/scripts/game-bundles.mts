#!/usr/bin/env node

// Keep assets/game-bundles in agreement with assets/game-bundles.sha256.
//
// The manifest uses the sha256sum format, so `sha256sum -c` can also check
// it. The bucket stores each bundle by name.
//
//   sync     Download the bundles that the manifest lists, then check them.
//   publish  Upload the local bundles and write the manifest from them.

import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = join(projectRoot, "assets", "game-bundles.sha256");
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
  const manifest = (await readFile(manifestPath, "utf8"))
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => ({ sha256: line.slice(0, 64), name: line.slice(66) }));

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
      `These bundles are not the same as the manifest:\n${failures.join("\n")}\n` +
        "If the bucket has a different bundle, run mise run admin:assets:publish where the bundle was made",
    );
  }
  console.log(`All ${manifest.length} game bundles agree with the manifest`);
};

const publish = async () => {
  const names = (await readdir(bundlesDir))
    .filter((name) => name.endsWith(".zip"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const lines = [];
  for (const name of names) lines.push(`${await hashFile(join(bundlesDir, name))}  ${name}`);

  rclone(
    ["copy", "--checksum", "--include", "*.zip", bundlesDir, remoteDir],
    process.env.ASSETS_UPLOAD_ACCESS_KEY,
    process.env.ASSETS_UPLOAD_SECRET_KEY,
  );
  await writeFile(manifestPath, `${lines.join("\n")}\n`);
  console.log("Updated assets/game-bundles.sha256. Commit it with your change");
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
