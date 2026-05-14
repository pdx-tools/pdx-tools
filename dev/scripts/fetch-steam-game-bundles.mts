#!/usr/bin/env node

import { spawn } from "child_process";
import { access, mkdir, rename, rm } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

type Game = "eu4" | "eu5";

type BundleTarget = {
  game: Game;
  branch?: string;
  version: string;
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
  { game: "eu4", branch: "1.29.6", version: "1.29" },
  { game: "eu4", branch: "1.30.6", version: "1.30" },
  { game: "eu4", branch: "1.31.6", version: "1.31" },
  { game: "eu4", branch: "1.32.2", version: "1.32" },
  { game: "eu4", branch: "1.33.3", version: "1.33" },
  { game: "eu4", branch: "1.34.5", version: "1.34" },
  { game: "eu4", branch: "1.35.6", version: "1.35" },
  { game: "eu4", branch: "1.36.2", version: "1.36" },
  { game: "eu4", version: "1.37" },
  { game: "eu5", branch: "1.0.11", version: "1.0" },
  { game: "eu5", branch: "1.1.10", version: "1.1" },
  { game: "eu5", version: "1.2" },
];

type Options = {
  game?: Game;
  username: string;
  archiveDir?: string;
  version?: string;
  dryRun: boolean;
  force: boolean;
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

const readBoolean = (name: string) => process.env[name] === "true";

const readGame = (): Game | undefined => {
  const game = process.env.usage_game;
  if (game === undefined || game === "") return undefined;
  if (game === "eu4" || game === "eu5") return game;
  throw new Error(`Invalid usage_game from mise: ${game}`);
};

const readOptionalString = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const readOptions = (): Options => {
  const username = process.env.usage_username ?? "";
  if (!username.trim()) {
    throw new Error("Provide --username or set STEAM_USERNAME through mise");
  }

  return {
    username: username.trim(),
    game: readGame(),
    archiveDir: readOptionalString("usage_archive_dir"),
    version: readOptionalString("usage_version"),
    dryRun: readBoolean("usage_dry_run"),
    force: readBoolean("usage_force"),
  };
};

const labelFor = (target: BundleTarget) => target.branch ?? "public";

const archiveLabelFor = (target: BundleTarget) => target.branch ?? target.version;

const installDirFor = (target: BundleTarget) =>
  join(projectRoot, "assets", "steam", "tmp", target.game, labelFor(target));

const archiveZipPathFor = (target: BundleTarget, archiveDir: string) =>
  join(archiveDir, target.game, `${archiveLabelFor(target)}.zip`);

const archiveTempZipPathFor = (archiveZipPath: string) => `${archiveZipPath}.tmp`;

const targetMatchesVersion = (target: BundleTarget, version: string | undefined) => {
  if (version === undefined) return true;
  if (version === "public") return target.branch === undefined;
  return target.version === version;
};

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
  const options = readOptions();
  const gameBundlesDir = join(projectRoot, "assets", "game-bundles");
  await mkdir(gameBundlesDir, { recursive: true });

  await run("cargo", ["build", "--release", "--package", "pdx-assets"], {
    dryRun: options.dryRun,
  });

  const selectedTargets = targets.filter(
    (t) =>
      (options.game === undefined || t.game === options.game) &&
      targetMatchesVersion(t, options.version),
  );

  for (const target of selectedTargets) {
    const installDir = installDirFor(target);
    const archiveZipPath =
      options.archiveDir === undefined ? undefined : archiveZipPathFor(target, options.archiveDir);
    console.log(`\n=== ${target.game} ${labelFor(target)} ===`);

    if (archiveZipPath === undefined) {
      try {
        await rm(installDir, { force: true, recursive: true });
        await run(pdxAssetsBinary, fetchArgsFor(target, installDir, options.username), {
          dryRun: options.dryRun,
        });
        await run(
          pdxAssetsBinary,
          [
            "bundle",
            "--game",
            target.game,
            "--version",
            target.version,
            installDir,
            gameBundlesDir,
          ],
          { dryRun: options.dryRun },
        );
      } finally {
        if (options.dryRun) {
          console.log(`$ rm -rf ${shellQuote(installDir)}`);
        } else {
          await rm(installDir, { force: true, recursive: true });
        }
      }

      continue;
    }

    const archiveExists = await exists(archiveZipPath);
    const archiveTempZipPath = archiveTempZipPathFor(archiveZipPath);
    if (archiveExists && !options.force) {
      console.log(`Using existing archive ${archiveZipPath}`);
    } else {
      try {
        await rm(installDir, { force: true, recursive: true });
        await rm(archiveTempZipPath, { force: true });
        if (options.dryRun) {
          console.log(`$ mkdir -p ${shellQuote(dirname(archiveZipPath))}`);
        } else {
          await mkdir(dirname(archiveZipPath), { recursive: true });
        }
        await run(pdxAssetsBinary, fetchArgsFor(target, installDir, options.username), {
          dryRun: options.dryRun,
        });
        await run(pdxAssetsBinary, ["pack", installDir, archiveTempZipPath], {
          dryRun: options.dryRun,
        });

        if (options.dryRun) {
          console.log(`$ mv ${shellQuote(archiveTempZipPath)} ${shellQuote(archiveZipPath)}`);
        } else {
          await rename(archiveTempZipPath, archiveZipPath);
        }
      } finally {
        if (options.dryRun) {
          console.log(`$ rm -rf ${shellQuote(installDir)} ${shellQuote(archiveTempZipPath)}`);
        } else {
          await rm(installDir, { force: true, recursive: true });
          await rm(archiveTempZipPath, { force: true });
        }
      }
    }

    await run(
      pdxAssetsBinary,
      [
        "bundle",
        "--game",
        target.game,
        "--version",
        target.version,
        archiveZipPath,
        gameBundlesDir,
      ],
      { dryRun: options.dryRun },
    );
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
