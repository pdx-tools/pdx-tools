#!/usr/bin/env node

import { spawn } from "child_process";
import { access, mkdir, rm } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

type Game = "eu4" | "eu5";

type BundleTarget = {
  game: Game;
  branch?: string;
  expectedBundle: string;
};

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

const targets: BundleTarget[] = [
  { game: "eu4", branch: "1.29.6", expectedBundle: "eu4-1.29.zip" },
  { game: "eu4", branch: "1.30.6", expectedBundle: "eu4-1.30.zip" },
  { game: "eu4", branch: "1.31.6", expectedBundle: "eu4-1.31.zip" },
  { game: "eu4", branch: "1.32.2", expectedBundle: "eu4-1.32.zip" },
  { game: "eu4", branch: "1.33.3", expectedBundle: "eu4-1.33.zip" },
  { game: "eu4", branch: "1.34.5", expectedBundle: "eu4-1.34.zip" },
  { game: "eu4", branch: "1.35.6", expectedBundle: "eu4-1.35.zip" },
  { game: "eu4", branch: "1.36.2", expectedBundle: "eu4-1.36.zip" },
  { game: "eu4", expectedBundle: "eu4-1.37.zip" },
  { game: "eu5", branch: "1.0.11", expectedBundle: "eu5-1.0.zip" },
  { game: "eu5", expectedBundle: "eu5-1.1.zip" },
];

type Options = {
  game?: Game;
  username: string;
  dryRun: boolean;
  force: boolean;
  keepInstalls: boolean;
};

const exists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const run = (command: string, args: string[], options: { dryRun?: boolean } = {}) => {
  console.log(`$ ${[command, ...args].map(shellQuote).join(" ")}`);
  if (options.dryRun) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${command}`));
      }
    });

    child.on("error", reject);
  });
};

const shellQuote = (value: string) => {
  if (/^[a-zA-Z0-9_./:=+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
};

const parseArgs = (): Options => {
  const options: Options = {
    username: "",
    dryRun: false,
    force: false,
    keepInstalls: false,
  };

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--username": {
        const username = args[i + 1];
        if (!username) throw new Error("--username requires a value");
        options.username = username;
        i += 1;
        break;
      }
      case "--game": {
        const game = args[i + 1];
        if (game !== "eu4" && game !== "eu5") {
          throw new Error("--game requires either eu4 or eu5");
        }
        options.game = game;
        i += 1;
        break;
      }
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--keep-installs":
        options.keepInstalls = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const username = options.username || process.env.STEAM_USERNAME || "";
  if (!username.trim()) {
    throw new Error("Provide --username or set STEAM_USERNAME");
  }

  options.username = username.trim();
  return options;
};

const printHelp = () => {
  console.log(`Fetch Steam game patches, create raw game bundles, and remove installs.

Usage:
  mise run assets:steam:bundle -- --username <steam-user>

Options:
  --username <name>  Steam username. Defaults to STEAM_USERNAME.
  --game <eu4|eu5>   Only process targets for one game.
  --force            Recreate bundles that already exist.
  --keep-installs    Keep temporary game installs under assets/steam/tmp.
  --dry-run          Print commands without executing them.
  -h, --help         Print help.
`);
};

const labelFor = (target: BundleTarget) => target.branch ?? "public";

const installDirFor = (target: BundleTarget) =>
  join(projectRoot, "assets", "steam", "tmp", target.game, labelFor(target));

const bundlePathFor = (target: BundleTarget) =>
  join(projectRoot, "assets", "game-bundles", target.expectedBundle);

const fetchArgsFor = (target: BundleTarget, installDir: string, username: string) => {
  const args = [
    "fetch-game",
    "--game",
    target.game,
    "--username",
    username,
    "--install-dir",
    installDir,
  ];

  if (target.branch) {
    args.push("--branch", target.branch);
  }

  return args;
};

const main = async () => {
  const options = parseArgs();
  const gameBundlesDir = join(projectRoot, "assets", "game-bundles");
  await mkdir(gameBundlesDir, { recursive: true });

  await run("cargo", ["build", "--release", "--package", "pdx-assets"], {
    dryRun: options.dryRun,
  });

  const selectedTargets = targets.filter(
    (t) => options.game === undefined || t.game === options.game,
  );

  for (const target of selectedTargets) {
    const bundlePath = bundlePathFor(target);
    if (!options.force && (await exists(bundlePath))) {
      console.log(`Skipping ${target.game} ${labelFor(target)}; ${bundlePath} already exists`);
      continue;
    }

    const installDir = installDirFor(target);
    console.log(`\n=== ${target.game} ${labelFor(target)} ===`);

    try {
      await rm(installDir, { force: true, recursive: true });
      await run(pdxAssetsBinary, fetchArgsFor(target, installDir, options.username), {
        dryRun: options.dryRun,
      });
      await run(pdxAssetsBinary, ["bundle", "--game", target.game, installDir, gameBundlesDir], {
        dryRun: options.dryRun,
      });
    } finally {
      if (!options.keepInstalls) {
        if (options.dryRun) {
          console.log(`$ rm -rf ${shellQuote(installDir)}`);
        } else {
          await rm(installDir, { force: true, recursive: true });
        }
      }
    }
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
