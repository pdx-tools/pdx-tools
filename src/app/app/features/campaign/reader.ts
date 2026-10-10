import { createWorkerQueue } from "@/lib/workerQueue";
import type { WorkerQueueOptions } from "@/lib/workerQueue";
import type * as Eu4Reader from "@/features/eu4/reader/module";
import type * as Eu5Reader from "@/features/eu5/workers/reader/module";
import type { CampaignGame, SaveIdentity } from "./types";

const options: WorkerQueueOptions = { idleMs: 10_000, timeoutMs: 60_000 };

/**
 * Each game reads the saves that are not on screen in a reader worker of
 * its own, apart from the worker of the open save. Thus a read does not
 * wait for a parse, and the end of an analysis does not stop a read.
 */
const readers = {
  eu4: createWorkerQueue<typeof Eu4Reader>(
    () => new Worker(new URL("../eu4/reader/worker.ts", import.meta.url), { type: "module" }),
    options,
  ),
  eu5: createWorkerQueue<typeof Eu5Reader>(
    () =>
      new Worker(new URL("../eu5/workers/reader/worker.ts", import.meta.url), { type: "module" }),
    options,
  ),
};

/** Read the campaign identity and date of a save file from its metadata. */
export function readSaveIdentity(game: CampaignGame, file: File): Promise<SaveIdentity> {
  const label = `the identity of ${file.name}`;
  switch (game) {
    case "eu4":
      return readers.eu4.run((api) => api.readIdentity(file), { label });
    case "eu5":
      return readers.eu5.run((api) => api.readIdentity(file), { label });
  }
}
