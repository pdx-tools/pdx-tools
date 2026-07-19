#!/usr/bin/env node

import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readdir } from "fs/promises";

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

  await execCommand(`${envPrefix} cp ../src/app/migrations db:/`);
  // Run migrations
  const migrationFiles = await readdir(resolve(projectRoot, "src/app/migrations"));
  const sqlFiles = migrationFiles.filter((file) => file.endsWith(".sql")).sort();

  for (const sqlFile of sqlFiles) {
    await execCommand(`${envPrefix} exec -u postgres --no-TTY db psql -f /migrations/${sqlFile}`);
  }

  const upArgs = remainingArgs.length > 0 ? ` ${remainingArgs.join(" ")}` : "";
  await execCommand(`${envPrefix} up${upArgs}`);
}

await main();
