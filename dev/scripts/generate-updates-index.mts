#!/usr/bin/env node

import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const updatesDir = path.join(rootDir, "src", "app", "public", "updates");
const outputPath = path.join(rootDir, "src", "app", "public", "updates.json");

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

async function main() {
  const entries = await readdir(updatesDir, { withFileTypes: true });
  const dates: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const date = path.parse(entry.name).name;
    if (!ISO_DATE_REGEX.test(date)) {
      console.warn(
        `Skipping ${entry.name} because it does not match YYYY-MM-DD format.`,
      );
      continue;
    }

    dates.push(date);
  }

  dates.sort((a, b) => (a < b ? 1 : -1));
  await writeFile(outputPath, `${JSON.stringify(dates, null, 2)}\n`, "utf-8");
  console.log(`Indexed ${dates.length} releases -> ${path.relative(rootDir, outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
