#!/usr/bin/env node

import { spawn } from "child_process";
import { readdir, access } from "fs/promises";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readAssetCatalog } from "./asset-catalog.mts";
import type { AssetRelease } from "./asset-catalog.mts";

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

type Game = "eu4" | "eu5" | "hoi4";

const gameFromMise = (): Game | undefined => {
  const game = process.env.usage_game;
  if (game === undefined || game === "") return undefined;
  if (game === "eu4" || game === "eu5" || game === "hoi4") return game;
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

  const catalog = await readAssetCatalog();
  const files = new Set(await readdir(gameBundlesDir));
  const remainingTasks: Promise<unknown>[] = [];
  for (const game of ["eu4", "eu5"] as const) {
    if (filterGame !== undefined && game !== filterGame) continue;
    // An unpublished release has no bundle, thus use the latest bundle that is
    // present. It supplies the shared images. Older releases skip them.
    const releases = catalog.games[game].releases.filter((release) => files.has(release.bundle));
    const latest = releases.at(-1);
    if (latest === undefined) continue;

    const compileArgs = (release: AssetRelease) => [
      "compile",
      ...(release === latest ? [] : ["--minimal"]),
      "--game-version",
      release.game_version,
      ...opts,
      join(gameBundlesDir, release.bundle),
    ];
    await execCommand(pdxAssetsBinary, compileArgs(latest));
    for (const release of releases) {
      if (release === latest) continue;
      remainingTasks.push(execCommand(pdxAssetsBinary, compileArgs(release)));
    }
  }

  await Promise.all(remainingTasks);
}

await packageAll();
