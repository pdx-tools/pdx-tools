import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("../../src/app/", import.meta.url));
const require = createRequire(resolve(appDir, "package.json"));

type Suite = { name: string; cli: string; args: string[] };

function runSuite(suite: Suite): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [suite.cli, ...suite.args], {
      cwd: appDir,
      stdio: "inherit",
    });
    child.once("error", (error) => {
      console.error(`Cannot run ${suite.name} tests:`, error);
      resolve(1);
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
}

const [mode, ...args] = process.argv.slice(2);
if (mode !== "all" && mode !== "integration" && mode !== "e2e") {
  throw new Error("Test mode must be all, integration, or e2e");
}

const suites: Suite[] = [];
if (mode !== "e2e") {
  const cli = resolve(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
  if (mode === "all") {
    suites.push({ name: "unit", cli, args: ["run", "--project", "unit"] });
  }
  suites.push({
    name: "integration",
    cli,
    args: ["run", "--project", "integration", ...(mode === "integration" ? args : [])],
  });
}
if (mode !== "integration") {
  suites.push({
    name: "browser",
    cli: require.resolve("@playwright/test/cli"),
    args: ["test", ...args],
  });
}

// Run all suites, also when a suite fails, and then show the results together.
const results: { name: string; code: number }[] = [];
for (const suite of suites) {
  console.log(`\nRunning ${suite.name} tests`);
  results.push({ name: suite.name, code: await runSuite(suite) });
}

console.log("\nTest suite results:");
for (const { name, code } of results) {
  console.log(`${name}: ${code === 0 ? "passed" : `failed (exit ${code})`}`);
}
process.exitCode = results.some(({ code }) => code !== 0) ? 1 : 0;
