#!/usr/bin/env node

import { exec } from "child_process";
import { promisify } from "util";
import { readdir, access } from "fs/promises";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..', '..');

// Helper functions
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const execCommand = async (command, dryRun = false, options = {}) => {
  if (dryRun) {
    console.log(`  [DRY RUN] Would execute: ${command}`);
    return;
  }
  
  try {
    await execAsync(command, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: "inherit",
      ...options,
    });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    throw error;
  }
};

async function packageAll() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const opts = args.filter((arg) => arg !== "--dry-run");

  const gameBundlesDir = join(projectRoot, "assets/game-bundles");

  // Check if game-bundles directory exists
  if (!(await exists(gameBundlesDir))) {
    console.error(`directory not detected: \`${gameBundlesDir}\``);
    process.exit(1);
  }

  // Get all EU4 bundles (excluding common files)
  const allFiles = await readdir(gameBundlesDir);
  const eu4Bundles = allFiles
    .filter((file) => file.startsWith("eu4-") && !file.includes("common"))
    .sort((a, b) => {
      // Natural sort for version numbers
      const aMatch = a.match(/eu4-(\d+)\.(\d+)/);
      const bMatch = b.match(/eu4-(\d+)\.(\d+)/);

      if (aMatch && bMatch) {
        const aMajor = parseInt(aMatch[1], 10);
        const aMinor = parseInt(aMatch[2], 10);
        const bMajor = parseInt(bMatch[1], 10);
        const bMinor = parseInt(bMatch[2], 10);

        if (aMajor !== bMajor) {
          return aMajor - bMajor;
        }
        return aMinor - bMinor;
      }

      // Fallback to lexical sort
      return a.localeCompare(b);
    });

  console.log(`📦 Found ${eu4Bundles.length} EU4 bundles to process`);

  if (eu4Bundles.length === 0) {
    return;
  }

  const lastBundle = eu4Bundles.pop();
  for (const bundle of eu4Bundles) {
    const bundlePath = join(gameBundlesDir, bundle);
    console.log(`📦 Processing ${bundle}...`);

    // Other bundles: skip common files
    const command = `mise run asset-pipeline ${opts.join(" ")} --skip-common "${bundlePath}"`;
    await execCommand(command, dryRun);
  }

  const command = `mise run asset-pipeline ${opts.join(" ")} "${join(gameBundlesDir, lastBundle)}"`;
  await execCommand(command, dryRun);

  console.log("✅ All bundles processed successfully");
}

await packageAll();
