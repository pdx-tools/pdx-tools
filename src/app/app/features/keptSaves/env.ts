import { keptBytes } from "./bytes";
import { keptDb } from "./db";
import type { KeptEnv } from "./store";

export const keptEnv: KeptEnv = {
  db: keptDb,
  bytes: keptBytes,
  exclusive: async (run) => await navigator.locks.request("kept-store", run),
  now: Date.now,
};
