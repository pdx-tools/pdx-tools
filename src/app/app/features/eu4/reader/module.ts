import { parseDate } from "@/features/timeline/date";
import type { SaveIdentity } from "@/features/campaign/types";
import { wasm } from "../worker/common";

/**
 * Read the identity of a save from its metadata. The exact playthrough id
 * needs a parse of the gamestate, so it stays unknown; the metadata
 * campaign id is a hint in its place.
 */
export async function readIdentity(file: File): Promise<SaveIdentity> {
  const [data] = await Promise.all([
    file.arrayBuffer().then((x) => new Uint8Array(x)),
    wasm.initializeModule(),
  ]);
  const meta = wasm.module.parse_meta(data);
  const date = parseDate(meta.date);
  if (date === null) throw new Error(`save date is not valid: ${meta.date}`);
  return { playthroughId: null, campaignIdHint: meta.campaign_id || null, date };
}
