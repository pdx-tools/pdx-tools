import { parseDate } from "@/features/timeline/date";
import type { SaveIdentity } from "@/features/campaign/types";
import { toPlaythroughId } from "@/features/campaign/types";
import type { KeptIdentity } from "@/features/keptSaves/types";
import { wasm } from "../worker/common";

async function readBytes(file: File) {
  const [data] = await Promise.all([
    file.arrayBuffer().then((x) => new Uint8Array(x)),
    wasm.initializeModule(),
  ]);
  return data;
}

/** EU4 metadata provides a campaign hint; the exact identity requires a full parse. */
export async function readIdentity(file: File): Promise<SaveIdentity> {
  const data = await readBytes(file);
  const meta = wasm.module.parse_meta(data);
  const date = parseDate(meta.date);
  if (date === null) throw new Error(`save date is not valid: ${meta.date}`);
  return { playthroughId: null, campaignIdHint: meta.campaign_id || null, date };
}

/** Parse the whole save for the exact campaign identity. */
export async function readKeptIdentity(file: File): Promise<KeptIdentity> {
  const save = wasm.module.read_save_identity(await readBytes(file));
  return {
    playthroughId: toPlaythroughId(save.playthroughId),
    campaignIdHint: save.campaignId || null,
    date: save.date,
    flag: save.playerTag,
    countryName: save.countryName || save.playerTag,
  };
}
