import { parseDate } from "@/features/timeline/date";
import type { SaveIdentity } from "@/features/campaign/types";
import { wasm } from "../worker/common";

/** EU4 metadata provides a campaign hint; the exact identity requires a full parse. */
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
