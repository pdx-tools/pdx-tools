#!/usr/bin/env node

import { spawn } from "child_process";
import { realpathSync } from "fs";
import { access, mkdir, rename, rm } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const games = ["eu4", "eu5", "ck3", "hoi4", "imperator", "vic3"] as const;

type Game = (typeof games)[number];

/** Games that the asset pipeline can turn into a compiled bundle */
const bundledGames: Game[] = ["eu4", "eu5"];

/**
 * `branch` is the Steam beta branch to download; omit it for `public`.
 * `version` names the archive and must match the version the download
 * reports in its launcher settings. Give the full patch version for
 * moving branches (public, open betas) so that each archive records the
 * patch it holds.
 */
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
  { game: "eu4", version: "1.37.5" },
  { game: "eu5", branch: "1.0.11", version: "1.0" },
  { game: "eu5", branch: "1.1.10", version: "1.1" },
  { game: "eu5", branch: "1.2.5", version: "1.2" },
  { game: "eu5", branch: "1.3.11", version: "1.3" },
  { game: "ck3", version: "1.19.0.6" },
  { game: "hoi4", version: "1.19.2" },
  { game: "imperator", version: "2.0.5" },
  { game: "vic3", branch: "1.14-openbeta", version: "1.14" },
];

type Options = {
  game?: Game;
  username: string;
  archiveDir?: string;
  version?: string;
  dryRun: boolean;
  force: boolean;
  check: boolean;
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

/** Run a command and return its stdout. Stdin and stderr pass through */
const capture = (command: string, args: string[]) => {
  console.log(`$ ${[command, ...args].map(shellQuote).join(" ")}`);
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: ["inherit", "pipe", "inherit"],
    });

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("close", (code) => {
      const output = Buffer.concat(chunks).toString("utf8");
      if (code === 0) {
        resolve(output);
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
  const found = games.find((x) => x === game);
  if (found !== undefined) return found;
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
    check: readBoolean("usage_check"),
  };
};

const labelFor = (target: BundleTarget) => target.branch ?? "public";

const archiveLabelFor = (target: BundleTarget) => target.branch ?? target.version;

/** The asset pipeline keys compiled output by major.minor */
const bundleVersionFor = (target: BundleTarget) => target.version.split(".").slice(0, 2).join(".");

/** Is `prefix` equal to `version` or a leading run of its dotted components? */
const isVersionPrefix = (prefix: string, version: string) =>
  version === prefix || version.startsWith(`${prefix}.`);

const installDirFor = (target: BundleTarget) =>
  join(projectRoot, "assets", "steam", "tmp", target.game, labelFor(target));

const archiveZipPathFor = (target: BundleTarget, archiveDir: string) =>
  join(archiveDir, target.game, `${archiveLabelFor(target)}.zip`);

const archiveTempZipPathFor = (archiveZipPath: string) => `${archiveZipPath}.tmp`;

/**
 * SteamCMD downloads more than the game. The Steamworks Common
 * Redistributables (app 228980) and the account's subscribed Workshop items
 * land in the install directory too. Keep the game's own appmanifest, since
 * it records the Steam build ID of the archive.
 */
const packExcludes = ["_CommonRedist/", "steamapps/workshop/", "steamapps/appmanifest_228980.acf"];

const packArgsFor = (installDir: string, outputZip: string) => [
  "pack",
  ...packExcludes.flatMap((prefix) => ["--exclude", prefix]),
  installDir,
  outputZip,
];

const targetMatchesVersion = (target: BundleTarget, version: string | undefined) => {
  if (version === undefined) return true;
  if (version === "public") return target.branch === undefined;
  return isVersionPrefix(version, target.version);
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

/**
 * A branch named after a full version (1.29.6) is frozen on Steam. Every
 * other branch (public, 1.14-openbeta) moves as Paradox pushes builds, so
 * its archive can become stale.
 */
const isPinnedBranch = (target: BundleTarget) =>
  target.branch !== undefined && /^\d+(\.\d+)*$/.test(target.branch);

type BuildInfo = {
  app_id: number;
  build_id: number;
  branch: string;
  /** From the launcher settings; null for games without them (EU5) */
  game_version: string | null;
};

/** Read the Steam build and game version recorded in an archive or install directory */
const buildInfoFor = async (target: BundleTarget, source: string) => {
  const output = await capture(pdxAssetsBinary, ["build-info", "--game", target.game, source]);
  return JSON.parse(output.trim().split("\n").at(-1) ?? "") as BuildInfo;
};

/** Read the Steam build recorded in the archive's appmanifest */
const archiveBuildFor = async (target: BundleTarget, archiveZipPath: string) => {
  try {
    return await buildInfoFor(target, archiveZipPath);
  } catch (error) {
    console.warn(
      `Could not read the Steam build from ${archiveZipPath}: ${error instanceof Error ? error.message : error}`,
    );
    return undefined;
  }
};

/**
 * Stop when the download is not the patch that the target list names. The
 * public branch moves, so a stale target entry would otherwise archive a
 * newer patch under the old name. Games without launcher settings (EU5)
 * cannot be checked.
 */
const verifyDownloadedVersion = async (target: BundleTarget, installDir: string) => {
  const info = await buildInfoFor(target, installDir);
  if (info.game_version === null) {
    console.log(`Downloaded build ${info.build_id} (no launcher version to check)`);
    return;
  }

  console.log(`Downloaded build ${info.build_id}, launcher version ${info.game_version}`);
  if (!isVersionPrefix(target.version, info.game_version)) {
    throw new Error(
      `${target.game} ${labelFor(target)} downloaded as version ${info.game_version}, but the target list names it ${target.version}. Update the target list and run again.`,
    );
  }
};

/** Output of `pdx-assets steam-builds`: build IDs keyed by game, then branch */
type SteamBuilds = Partial<Record<Game, Record<string, number>>>;

/**
 * Ask Steam for the latest build ID of every target in one SteamCMD
 * session. Returns an empty map when SteamCMD is unavailable so callers
 * can fall back to the existing archives.
 */
const fetchSteamBuilds = async (targets: BundleTarget[], options: Options) => {
  const builds = new Map<BundleTarget, number>();
  if (targets.length === 0) return builds;

  const games = [...new Set(targets.map((t) => t.game))];
  const args = [
    "steam-builds",
    "--username",
    options.username,
    ...games.flatMap((game) => ["--game", game]),
  ];

  if (options.dryRun) {
    console.log(`$ ${[pdxAssetsBinary, ...args].map(shellQuote).join(" ")}`);
    return builds;
  }

  try {
    const output = await capture(pdxAssetsBinary, args);
    const steamBuilds = JSON.parse(output.trim().split("\n").at(-1) ?? "") as SteamBuilds;
    for (const target of targets) {
      const buildId = steamBuilds[target.game]?.[labelFor(target)];
      if (buildId !== undefined) builds.set(target, buildId);
    }
  } catch (error) {
    console.warn(
      `SteamCMD metadata query failed: ${error instanceof Error ? error.message : error}`,
    );
  }
  return builds;
};

type ArchiveStatus = "missing" | "pinned" | "fresh" | "stale" | "unknown" | "unreadable";

const describeStatus = (status: ArchiveStatus) =>
  ({
    missing: "no archive; download",
    pinned: "pinned branch; reuse archive",
    fresh: "archive matches Steam build; reuse archive",
    stale: "Steam has a newer build; download",
    unknown: "Steam build unknown; reuse archive",
    unreadable: "archive has no Steam manifest; download",
  })[status];

const archiveStatusFor = async (
  target: BundleTarget,
  archiveZipPath: string,
  steamBuilds: Map<BundleTarget, number>,
  options: Options,
): Promise<ArchiveStatus> => {
  if (!(await exists(archiveZipPath))) return "missing";
  if (isPinnedBranch(target)) return "pinned";

  const remote = steamBuilds.get(target);
  if (remote === undefined) return "unknown";
  if (options.dryRun) return "unknown";

  const local = await archiveBuildFor(target, archiveZipPath);
  if (local === undefined) return "unreadable";
  console.log(`Archive build ${local.build_id}, Steam build ${remote}`);
  return local.build_id === remote ? "fresh" : "stale";
};

const needsDownload = (status: ArchiveStatus) =>
  status === "missing" || status === "stale" || status === "unreadable";

const main = async () => {
  const options = readOptions();
  if (options.check && options.archiveDir === undefined) {
    throw new Error("--check needs --archive-dir to know which archives to inspect");
  }
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

  const movingTargets =
    options.archiveDir === undefined || options.force
      ? []
      : selectedTargets.filter((t) => !isPinnedBranch(t));
  const steamBuilds = await fetchSteamBuilds(movingTargets, options);

  for (const target of selectedTargets) {
    const installDir = installDirFor(target);
    const archiveZipPath =
      options.archiveDir === undefined ? undefined : archiveZipPathFor(target, options.archiveDir);
    console.log(`\n=== ${target.game} ${labelFor(target)} ===`);

    const bundles = bundledGames.includes(target.game);
    if (!bundles && archiveZipPath === undefined) {
      console.log(
        `Skipping ${target.game}: it has no asset pipeline, so it needs --archive-dir to store the download`,
      );
      continue;
    }

    if (archiveZipPath === undefined) {
      try {
        await rm(installDir, { force: true, recursive: true });
        await run(pdxAssetsBinary, fetchArgsFor(target, installDir, options.username), {
          dryRun: options.dryRun,
        });
        if (!options.dryRun) await verifyDownloadedVersion(target, installDir);
        await run(
          pdxAssetsBinary,
          [
            "bundle",
            "--game",
            target.game,
            "--version",
            bundleVersionFor(target),
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

    const status = await archiveStatusFor(target, archiveZipPath, steamBuilds, options);
    console.log(`${archiveZipPath}: ${describeStatus(status)}`);
    if (options.check) continue;

    const archiveTempZipPath = archiveTempZipPathFor(archiveZipPath);
    if (!needsDownload(status) && !options.force) {
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
        if (!options.dryRun) await verifyDownloadedVersion(target, installDir);
        await run(pdxAssetsBinary, packArgsFor(installDir, archiveTempZipPath), {
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

    if (bundles) {
      await run(
        pdxAssetsBinary,
        [
          "bundle",
          "--game",
          target.game,
          "--version",
          bundleVersionFor(target),
          archiveZipPath,
          gameBundlesDir,
        ],
        { dryRun: options.dryRun },
      );
    }
  }
};

const isEntryPoint = () => {
  try {
    return realpathSync(process.argv[1] ?? "") === __filename;
  } catch {
    return false;
  }
};

if (isEntryPoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
