#!/usr/bin/env node

// Local PostgreSQL for development and tests. mise installs it.
//
//   services.mts        Make a new, empty test database.
//   services.mts start  Start the dev database. The first start makes it.
//   services.mts stop   Stop the database.
//
// SERVICES_ENV is "dev" or "test" (the default).

import { execFileSync, spawnSync } from "node:child_process";
import type { SpawnSyncOptions } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const isWindows = process.platform === "win32";

// Small enough for a laptop: about 64 MB of memory.
const serverSettings = {
  listen_addresses: "localhost",
  // The default socket directory is often not writable. Clients use TCP.
  unix_socket_directories: "",
  max_connections: "20",
  superuser_reserved_connections: "2",
  shared_buffers: "16MB",
  effective_cache_size: "48MB",
  work_mem: "1MB",
  maintenance_work_mem: "16MB",
  min_wal_size: "32MB",
  max_wal_size: "64MB",
};

type ServicesEnv = "dev" | "test";

function loadConfig(env: ServicesEnv) {
  const appEnvFile = env === "dev" ? ".env.development" : ".env.test";
  const appEnv = parseEnv(readFileSync(resolve(projectRoot, "src/app", appEnvFile), "utf8"));
  const servicesEnv = parseEnv(readFileSync(resolve(projectRoot, "dev", `.env.${env}`), "utf8"));
  const port =
    env === "dev"
      ? (process.env.PDX_DEV_DATABASE_PORT ?? appEnv.DATABASE_PORT)
      : (process.env.DATABASE_PORT ?? appEnv.DATABASE_PORT);
  const adminPassword = process.env.DATABASE_ADMIN_PASSWORD ?? servicesEnv.DATABASE_ADMIN_PASSWORD;
  if (!port || !adminPassword) {
    throw new Error("Database port and admin password are required for local databases");
  }

  const name = env === "dev" ? (process.env.PDX_DEV_DATABASE_NAME ?? "dev") : "test";
  return {
    port,
    adminPassword,
    appUser: appEnv.DATABASE_USER,
    appPassword: appEnv.DATABASE_PASSWORD,
    backupPassword: servicesEnv.DATABASE_BACKUP_PASSWORD,
    dataDir: resolve(projectRoot, "dev/target/postgres", name),
  };
}

type Config = ReturnType<typeof loadConfig>;

function exec(command: string, args: string[], options: SpawnSyncOptions = {}) {
  console.log(`Executing: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: "inherit", ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

let pgPrefixCache: string | undefined;
function pgPrefix() {
  pgPrefixCache ??= execFileSync("mise", ["where", "conda:postgresql"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();
  return pgPrefixCache;
}

// On Windows, the mise commands on PATH are .cmd files, which need a shell.
// Run the programs directly instead.
const pgBin = (name: string) =>
  isWindows ? join(pgPrefix(), "Library", "bin", `${name}.exe`) : join(pgPrefix(), "bin", name);

const pg = (name: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) =>
  exec(pgBin(name), args, { env: { ...process.env, ...extraEnv } });

const isRunning = (dataDir: string) =>
  existsSync(dataDir) &&
  spawnSync(pgBin("pg_ctl"), ["status", "--pgdata", dataDir], { stdio: "ignore" }).status === 0;

// Use pg_ctl because PostgreSQL does not run with administrator rights, and on
// Windows pg_ctl removes them.
function startServer(config: Config, dataDir: string, logFile = join(dataDir, "server.log")) {
  const options = Object.entries(serverSettings).map(([name, value]) => `-c ${name}=${value}`);
  const args = ["start", "--wait", "--pgdata", dataDir, "--log", logFile, "-o"];
  try {
    // On Windows, the server keeps a copy of each output handle that pg_ctl
    // gets. An output pipe from mise would then stay open, and mise would not
    // stop. Give pg_ctl no output handles.
    exec(pgBin("pg_ctl"), [...args, [`-p ${config.port}`, ...options].join(" ")], {
      stdio: "ignore",
    });
  } catch (error) {
    if (existsSync(logFile)) {
      console.error(readFileSync(logFile, "utf8"));
    }
    throw error;
  }
}

// pg_ctl status ignores a postmaster.pid file from a server that stopped.
function stopServer(dataDir: string) {
  if (isRunning(dataDir)) {
    pg("pg_ctl", ["stop", "--wait", "--mode=fast", "--pgdata", dataDir]);
  }
}

// The directory gets its final name at the end, so a failed setup does not
// leave a partial database.
function initialize(config: Config) {
  const tempDir = `${config.dataDir}.init`;
  const passwordFile = `${tempDir}.password`;

  // An interrupted setup can leave its server running.
  stopServer(tempDir);
  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(dirname(tempDir), { recursive: true });

  writeFileSync(passwordFile, config.adminPassword);
  try {
    // Production sorts text with glibc en_US.utf8. macOS and Windows cannot do
    // this, so sort by byte value on all systems.
    pg("initdb", [
      "--pgdata",
      tempDir,
      "--username",
      "postgres",
      `--pwfile=${passwordFile}`,
      "--auth=scram-sha-256",
      "--encoding=UTF8",
      "--locale=C",
    ]);
  } finally {
    rmSync(passwordFile, { force: true });
  }

  startServer(config, tempDir);
  try {
    pg("psql", ["--no-psqlrc", "--file", "dev/sql/init-db.sql"], {
      PGHOST: "localhost",
      PGPORT: config.port,
      PGUSER: "postgres",
      PGPASSWORD: config.adminPassword,
      DATABASE_APP_USER: config.appUser,
      DATABASE_APP_USER_PASSWORD: config.appPassword,
      DATABASE_BACKUP_PASSWORD: config.backupPassword,
    });
  } finally {
    try {
      stopServer(tempDir);
    } catch (error) {
      // Do not hide the psql error.
      console.error(error);
    }
  }

  renameSync(tempDir, config.dataDir);
}

function migrate(config: Config) {
  const databaseUrl = new URL("postgresql://postgres@localhost/postgres");
  databaseUrl.port = config.port;
  databaseUrl.password = config.adminPassword;
  databaseUrl.searchParams.set("options", "-c client_min_messages=warning");
  const drizzleKit = resolve(projectRoot, "src/app/node_modules/drizzle-kit/bin.cjs");
  exec(process.execPath, [drizzleKit, "migrate", "--config", "drizzle-kit.config.ts"], {
    cwd: resolve(projectRoot, "src/app"),
    env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
  });
}

function start(config: Config) {
  if (!existsSync(join(config.dataDir, "PG_VERSION"))) {
    initialize(config);
  }
  if (isRunning(config.dataDir)) {
    console.log(`The database in ${config.dataDir} runs already`);
  } else {
    startServer(config, config.dataDir);
  }
  migrate(config);
}

function startFresh(config: Config) {
  stopServer(config.dataDir);
  rmSync(config.dataDir, { recursive: true, force: true });
  initialize(config);
  startServer(config, config.dataDir);
  migrate(config);
}

const env = process.env.SERVICES_ENV ?? "test";
if (env !== "dev" && env !== "test") {
  throw new Error(`SERVICES_ENV must be either "dev" or "test", got "${env}"`);
}
const config = loadConfig(env);
const command = process.argv[2];
switch (command) {
  case "start":
    start(config);
    break;
  case "stop":
    stopServer(config.dataDir);
    break;
  case undefined:
    startFresh(config);
    break;
  default:
    throw new Error(`Unknown command: ${command}`);
}
