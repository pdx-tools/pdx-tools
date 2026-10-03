import { wasm } from "@/features/eu4/worker/common";
import { toPlaythroughId } from "../types";
import type { SaveHeader } from "../types";

/**
 * EU4's campaign_id can change between saves of the same playthrough. Its
 * stable fingerprint needs the gamestate, which is parsed in this worker
 * without map assets. The worker ends when idle, freeing the parse memory.
 */
export async function readEu4Header(file: File): Promise<SaveHeader> {
  const [data] = await Promise.all([
    file.arrayBuffer().then((x) => new Uint8Array(x)),
    wasm.initializeModule(),
  ]);
  const meta = wasm.module.parse_playthrough(data);
  return { playthroughId: toPlaythroughId(meta.playthroughId), date: meta.date };
}
