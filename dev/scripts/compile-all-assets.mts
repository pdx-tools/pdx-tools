#!/usr/bin/env node

import { spawn } from "child_process";
import { readdir, access } from "fs/promises";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const isWindows = process.platform === "win32";
const pdxAssetsBinary = join(projectRoot, "target", "release", isWindows ? "pdx-assets.exe" : "pdx-assets");

// Helper functions
const exists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const execCommand = async (command: string, args: string[] = [], options = {}) => {
  console.log(`Executing: ${command} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      ...options,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(void 0);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
};

async function packageAll() {
  const args = process.argv.slice(2);
  const opts = args.filter((arg) => arg !== "--dry-run");

  const gameBundlesDir = join(projectRoot, "assets/game-bundles");

  // Check if game-bundles directory exists
  if (!(await exists(gameBundlesDir))) {
    console.error(`directory not detected: \`${gameBundlesDir}\``);
    process.exit(1);
  }

  // Get all zip files in game-bundles directory
  const allFiles = await readdir(gameBundlesDir);
  const zipBundles = allFiles
    .filter((file) => file.endsWith(".zip"))
    .sort((a, b) => {
      // Natural sort for version numbers
      const aMatch = a.match(/(\d+)\.(\d+)/);
      const bMatch = b.match(/(\d+)\.(\d+)/);

      if (aMatch && bMatch) {
        const aMajor = parseInt(aMatch[1] ?? "0", 10);
        const aMinor = parseInt(aMatch[2] ?? "0", 10);
        const bMajor = parseInt(bMatch[1] ?? "0", 10);
        const bMinor = parseInt(bMatch[2] ?? "0", 10);

        if (aMajor !== bMajor) {
          return aMajor - bMajor;
        }
        return aMinor - bMinor;
      }

      // Fallback to lexical sort
      return a.localeCompare(b);
    });

  console.log(`📦 Found ${zipBundles.length} bundles to process`);

  // Group bundles by game (e.g. "eu4", "eu5") based on filename prefix
  const gameGroups = new Map<string, string[]>();
  for (const bundle of zipBundles) {
    const match = bundle.match(/^([a-z0-9]+)-/);
    const game = match?.[1] ?? "unknown";
    const group = gameGroups.get(game) ?? [];
    group.push(bundle);
    gameGroups.set(game, group);
  }

  // EU4 supports --minimal to skip shared assets for older patches.
  // The latest EU4 bundle gets a full compile, earlier ones get --minimal.
  // Other games (e.g. EU5) don't use --minimal, so all bundles compile fully.
  const eu4Bundles = gameGroups.get("eu4") ?? [];
  const latestEu4 = eu4Bundles.pop();

  // Process the latest EU4 bundle first (full compile with shared assets)
  if (latestEu4 !== undefined) {
    const bundlePath = join(gameBundlesDir, latestEu4);
    console.log(`Processing ${latestEu4} (latest eu4 bundle)`);
    await execCommand(pdxAssetsBinary, ['compile', ...opts, bundlePath]);
  }

  // Process older EU4 bundles with --minimal and all non-EU4 bundles in parallel
  const remainingTasks: Promise<unknown>[] = [];

  for (const bundle of eu4Bundles) {
    const bundlePath = join(gameBundlesDir, bundle);
    remainingTasks.push(execCommand(pdxAssetsBinary, ['compile', '--minimal', ...opts, bundlePath]));
  }

  for (const [game, bundles] of gameGroups) {
    if (game === "eu4") continue;
    for (const bundle of bundles) {
      const bundlePath = join(gameBundlesDir, bundle);
      remainingTasks.push(execCommand(pdxAssetsBinary, ['compile', ...opts, bundlePath]));
    }
  }

  await Promise.all(remainingTasks);
}

await packageAll();
