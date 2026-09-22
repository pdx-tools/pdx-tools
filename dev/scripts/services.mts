#!/usr/bin/env node

import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import { parseEnv } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");

const execCommand = async (command: string, options = {}) => {
  console.log(`Executing: ${command}`);
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd" : "sh";
    const shellFlag = isWindows ? "/c" : "-c";

    const child = spawn(shell, [shellFlag, command], {
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

async function main() {
  const env = process.env.SERVICES_ENV ?? "test";
  if (env !== "dev" && env !== "test") {
    throw new Error(`SERVICES_ENV must be either "dev" or "test", got "${env}"`);
  }
  const remainingArgs = process.argv.slice(2);

  const envPrefix = `mise run env:${env} --`;

  await execCommand(`${envPrefix} build`);
  await execCommand(`${envPrefix} up --no-start`);
  await execCommand(`${envPrefix} up --wait db`);

  const appEnvFile = env === "dev" ? ".env.development" : ".env.test";
  const appEnv = parseEnv(await readFile(resolve(projectRoot, "src/app", appEnvFile), "utf8"));
  const servicesEnv = parseEnv(await readFile(resolve(projectRoot, "dev", `.env.${env}`), "utf8"));
  const port =
    env === "dev"
      ? (process.env.PDX_DEV_DATABASE_PORT ?? "5432")
      : (process.env.DATABASE_PORT ?? appEnv.DATABASE_PORT);
  const password = process.env.DATABASE_ADMIN_PASSWORD ?? servicesEnv.DATABASE_ADMIN_PASSWORD;
  if (!port || !password) {
    throw new Error("Database port and admin password are required for local migrations");
  }

  const databaseUrl = new URL("postgresql://postgres@127.0.0.1/postgres");
  databaseUrl.port = port;
  databaseUrl.password = password;
  databaseUrl.searchParams.set("options", "-c client_min_messages=warning");
  await execCommand("pnpm exec drizzle-kit migrate --config drizzle-kit.config.ts", {
    cwd: resolve(projectRoot, "src/app"),
    env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
  });

  const upArgs = remainingArgs.length > 0 ? ` ${remainingArgs.join(" ")}` : "";
  await execCommand(`${envPrefix} up${upArgs}`);
}

await main();
