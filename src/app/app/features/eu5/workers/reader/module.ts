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

async function readFileStart(file: File, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, end).arrayBuffer());
}

/** Fallback for saves without a metadata prefix length. */
function readWholeFileMeta(data: Uint8Array) {
  const loader = wasm_eu5.Eu5MetaParser.create().init(data);
  try {
    return loader.meta();
  } finally {
    loader.free();
  }
}

/** Read only the metadata prefix when the save format supports it. */
export async function readIdentity(file: File): Promise<SaveIdentity> {
  await ready;
  const start = await readFileStart(file, wasm_eu5.save_header_max_len());
  const prefixLen = wasm_eu5.save_metadata_prefix_len(start);
  const meta =
    prefixLen === undefined
      ? readWholeFileMeta(new Uint8Array(await file.arrayBuffer()))
      : wasm_eu5.read_save_metadata_prefix(await readFileStart(file, prefixLen));
  return {
    playthroughId: toPlaythroughId(meta.playthroughId),
    campaignIdHint: null,
    date: meta.date,
  };
}
