import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eu4Saves, eu5Saves, users } from "@/server-lib/db/schema";
import { oneshotDb } from "@/server-lib/db/connection";
import type { DbConnection } from "@/server-lib/db/connection";

// Shared by the server tests (Vitest) and the browser tests (Playwright).
// Both run against the stack that `mise run test:app` starts.

export const dbConnection = "postgres://app_user:mercantilismbaby@localhost:5433/postgres";
export const appUrl = "http://localhost:3000";
export const parseApiUrl = "http://localhost:8081";

export function withDb<R>(fn: (db: DbConnection) => Promise<R>) {
  return oneshotDb(dbConnection, fn);
}

export async function resetDb() {
  await withDb(async (db) => {
    await db.delete(eu5Saves);
    await db.delete(eu4Saves);
    await db.delete(users);
  });
}

type Game = "eu4" | "eu5";

const savesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../assets/saves",
);

/**
 * The path of a save fixture. The save is downloaded from the dev CDN and
 * cached when it is not on disk. CI compares the fixtures logged to
 * `PDX_FIXTURES_LOG` with the fixture lists.
 */
export async function saveFixture(game: Game, name: string): Promise<string> {
  const log = process.env.PDX_FIXTURES_LOG;
  if (log) {
    await fs.appendFile(log, `${game}/${name}\n`);
  }

  const dir = path.join(savesDir, game);
  const location = path.join(dir, name);
  try {
    await fs.access(location);
    return location;
  } catch {
    const resp = await fetch(`https://cdn-dev.pdx.tools/${game}-saves/${name}`);
    if (!resp.ok) {
      throw new Error(`unable to retrieve: ${game}/${name}`);
    }
    await fs.mkdir(dir, { recursive: true });
    // Write to a temporary file first, so that a parallel reader never sees a
    // partial save.
    const tmp = `${location}.${process.pid}.tmp`;
    await fs.writeFile(tmp, Buffer.from(await resp.arrayBuffer()));
    await fs.rename(tmp, location);
    return location;
  }
}

export async function readSaveFixture(game: Game, name: string) {
  return await fs.readFile(await saveFixture(game, name));
}
