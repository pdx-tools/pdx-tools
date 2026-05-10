#!/usr/bin/env node

import { spawn } from "child_process";
import { readdir, access } from "fs/promises";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const isWindows = process.platform === "win32";
const pdxAssetsBinary = join(
  projectRoot,
  "target",
  "release",
  isWindows ? "pdx-assets.exe" : "pdx-assets",
);

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
  console.log(`Executing: ${command} ${args.join(" ")}`);
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

type Game = "eu4" | "eu5";

const gameFromMise = (): Game | undefined => {
  const game = process.env.usage_game;
  if (game === undefined || game === "") return undefined;
  if (game === "eu4" || game === "eu5") return game;
  throw new Error(`Invalid usage_game from mise: ${game}`);
};

const compileArgsFromTask = () => process.argv.slice(2);

async function packageAll() {
  const filterGame = gameFromMise();
  const opts = compileArgsFromTask();

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
    if (filterGame !== undefined && game !== filterGame) continue;
    const group = gameGroups.get(game) ?? [];
    group.push(bundle);
    gameGroups.set(game, group);
  }

  // EU4 and EU5 support --minimal to skip shared UI assets for older patches.
  // The latest bundle per game gets a full compile; earlier ones get --minimal.
  const gamesWithMinimal = ["eu4", "eu5"];

  // Bundle filenames are {game}-{major}.{minor}.zip — extract the version portion.
  const versionOf = (bundle: string) => bundle.slice(bundle.indexOf("-") + 1, -4);

  // For each game that supports --minimal, process the latest bundle first.
  for (const game of gamesWithMinimal) {
    const bundles = gameGroups.get(game) ?? [];
    const latest = bundles.pop();
    if (latest !== undefined) {
      const bundlePath = join(gameBundlesDir, latest);
      console.log(`Processing ${latest} (latest ${game} bundle)`);
      await execCommand(pdxAssetsBinary, [
        "compile",
        "--version",
        versionOf(latest),
        ...opts,
        bundlePath,
      ]);
    }
  }

  // Process older bundles with --minimal and all remaining games in parallel
  const remainingTasks: Promise<unknown>[] = [];

  for (const game of gamesWithMinimal) {
    for (const bundle of gameGroups.get(game) ?? []) {
      const bundlePath = join(gameBundlesDir, bundle);
      remainingTasks.push(
        execCommand(pdxAssetsBinary, [
          "compile",
          "--minimal",
          "--version",
          versionOf(bundle),
          ...opts,
          bundlePath,
        ]),
      );
    }
  }

  for (const [game, bundles] of gameGroups) {
    if (gamesWithMinimal.includes(game)) continue;
    for (const bundle of bundles) {
      const bundlePath = join(gameBundlesDir, bundle);
      remainingTasks.push(
        execCommand(pdxAssetsBinary, [
          "compile",
          "--version",
          versionOf(bundle),
          ...opts,
          bundlePath,
        ]),
      );
    }
  }

  await Promise.all(remainingTasks);
}

await packageAll();
