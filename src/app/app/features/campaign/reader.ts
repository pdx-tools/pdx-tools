import { captureException } from "@/lib/captureException";
import { createWorkerQueue } from "@/lib/workerQueue";
import type { WorkerQueueOptions } from "@/lib/workerQueue";
import type * as Eu4Reader from "@/features/eu4/reader/module";
import type * as Eu5Reader from "@/features/eu5/workers/reader/module";
import type { KeptIdentity } from "@/features/keptSaves/types";
import type { CampaignGame, SaveIdentity } from "./types";

const options: WorkerQueueOptions = { idleMs: 10_000, timeoutMs: 60_000 };

const startEu4Reader = () =>
  new Worker(new URL("../eu4/reader/worker.ts", import.meta.url), { type: "module" });

/** Read campaign metadata independently of the analysis on screen. */
const readers = {
  eu4: createWorkerQueue<typeof Eu4Reader>(startEu4Reader, options),
  eu5: createWorkerQueue<typeof Eu5Reader>(
    () =>
      new Worker(new URL("../eu5/workers/reader/worker.ts", import.meta.url), { type: "module" }),
    options,
  ),
};

export function readSaveIdentity(game: CampaignGame, file: File): Promise<SaveIdentity> {
  const label = `the identity of ${file.name}`;
  switch (game) {
    case "eu4":
      return readers.eu4.run((api) => api.readIdentity(file), { label });
    case "eu5":
      return readers.eu5.run((api) => api.readIdentity(file), { label });
  }
}

/** Parse whole EU4 saves apart from the metadata reads, and free the memory after each. */
const eu4Parser = createWorkerQueue<typeof Eu4Reader>(startEu4Reader, {
  ...options,
  recycleAfterJob: true,
});

export type KeptIdentityResult = {
  status: "ok" | "failed";
  /** A failed read can still have the metadata. */
  identity: Partial<KeptIdentity>;
};

export async function readKeptIdentity(
  game: CampaignGame,
  file: File,
): Promise<KeptIdentityResult> {
  const label = `the campaign of ${file.name}`;
  try {
    const identity =
      game === "eu4"
        ? await eu4Parser.run((api) => api.readKeptIdentity(file), { label })
        : await readers.eu5.run((api) => api.readKeptIdentity(file), { label });
    return { status: "ok", identity };
  } catch (error) {
    captureException(error, { tags: { msg: "kept-identity" } });
    const identity = await readSaveIdentity(game, file).catch(() => ({}));
    return { status: "failed", identity };
  }
}
