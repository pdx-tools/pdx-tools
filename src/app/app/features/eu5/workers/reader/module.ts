import { fetchOk } from "@/lib/fetch";
import init, * as wasm_eu5 from "@/wasm/wasm_eu5";
import wasmPath from "@/wasm/wasm_eu5_bg.wasm?url";
import tokenPath from "../../../../../../../assets/tokens/eu5.bin?url";
import { toPlaythroughId } from "@/features/campaign/types";
import type { SaveIdentity } from "@/features/campaign/types";

const ready = Promise.all([
  init({ module_or_path: wasmPath }),
  fetchOk(tokenPath).then((x) => x.arrayBuffer()),
]).then(([, tokens]) => wasm_eu5.set_tokens(new Uint8Array(tokens)));

/** Read only the parts of the save that hold its metadata. */
export async function readIdentity(file: File): Promise<SaveIdentity> {
  await ready;
  const meta = wasm_eu5.read_save_metadata(file);
  return {
    playthroughId: toPlaythroughId(meta.playthroughId),
    campaignIdHint: null,
    date: meta.date,
  };
}
