#!/usr/bin/env node

import { spawn } from "child_process";
import { readdir, stat } from "fs/promises";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const bundlesDir = join(projectRoot, "assets/game-bundles");
const args = process.argv.slice(2);
const allowedFlags = new Set(["--all", "--dry-run", "--apply"]);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const bundles = args.filter((arg) => !arg.startsWith("--"));
const invalidFlags = [...flags].filter((flag) => !allowedFlags.has(flag));

if (invalidFlags.length > 0) {
  throw new Error(`Unknown option: ${invalidFlags.join(", ")}`);
}

const publishAll = flags.has("--all");
const dryRun = !flags.has("--apply");
if (flags.has("--dry-run") && flags.has("--apply")) {
  throw new Error("Choose either --dry-run or --apply");
}
if ((publishAll && bundles.length > 0) || (!publishAll && bundles.length !== 1)) {
  throw new Error(
    "Select one bundle or use --all. The default mode is --dry-run; pass --apply to upload",
  );
}

const bundlePattern = /^(eu4|eu5)-\d+\.\d+(?:\.\d+)*\.zip$/;
if (bundles.some((bundle) => !bundlePattern.test(bundle))) {
  throw new Error("Bundle names must match eu4-X.Y.zip or eu5-X.Y.zip");
}

const accessKey = process.env.ASSETS_UPLOAD_ACCESS_KEY;
const secretKey = process.env.ASSETS_UPLOAD_SECRET_KEY;
if (!accessKey || !secretKey) {
  throw new Error(
    "Set ASSETS_UPLOAD_ACCESS_KEY and ASSETS_UPLOAD_SECRET_KEY in the environment for this command",
  );
}

const entries = publishAll
  ? (await readdir(bundlesDir)).filter((name) => name.endsWith(".zip"))
  : bundles;
if (entries.length === 0) throw new Error(`No game bundles found in ${bundlesDir}`);
for (const name of entries) {
  if (!bundlePattern.test(name)) throw new Error(`Unsupported game bundle name: ${name}`);
  if (!(await stat(join(bundlesDir, name))).isFile()) {
    throw new Error(`Game bundle is not a file: ${join(bundlesDir, name)}`);
  }
}

const destination = publishAll
  ? ":s3:pdx-tools-build/game-bundles"
  : `:s3:pdx-tools-build/game-bundles/${bundles[0]}`;
const source = publishAll ? bundlesDir : join(bundlesDir, bundles[0]!);
const commandArgs = [
  "--verbose",
  "--s3-provider=AWS",
  "--s3-endpoint",
  "s3.us-west-002.backblazeb2.com",
  "--s3-no-check-bucket",
  `--s3-secret-access-key=${secretKey}`,
  `--s3-access-key-id=${accessKey}`,
  "--update",
  "--checksum",
  ...(dryRun ? ["--dry-run"] : []),
  publishAll ? "copy" : "copyto",
  source,
  destination,
];

console.log(
  `${dryRun ? "Dry run" : "Uploading"} ${publishAll ? `${entries.length} game bundles` : bundles[0]}`,
);
if (dryRun) console.log("Review this plan, then pass --apply to upload");

await new Promise<void>((resolvePromise, reject) => {
  const child = spawn("rclone", commandArgs, {
    cwd: projectRoot,
    stdio: "inherit",
  });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolvePromise();
    else reject(new Error(`rclone exited with code ${code}`));
  });
});
