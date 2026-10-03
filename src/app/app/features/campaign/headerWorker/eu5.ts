import { fetchOk } from "@/lib/fetch";
import init, * as wasm_eu5 from "@/wasm/wasm_eu5";
import wasmPath from "@/wasm/wasm_eu5_bg.wasm?url";
import tokenPath from "../../../../../../assets/tokens/eu5.bin?url";
import { toPlaythroughId } from "../types";
import type { SaveHeader } from "../types";

const ready = Promise.all([
  init({ module_or_path: wasmPath }),
  fetchOk(tokenPath).then((x) => x.arrayBuffer()),
]).then(([, tokens]) => wasm_eu5.set_tokens(new Uint8Array(tokens)));

/** Read the bytes `[0, end)` of a file. */
async function readFileStart(file: File, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, end).arrayBuffer());
}

/** The metadata of a save that has no metadata length in its header, such as a compressed debug save. */
function readWholeFileMeta(data: Uint8Array) {
  const loader = wasm_eu5.Eu5MetaParser.create().init(data);
  try {
    return loader.meta();
  } finally {
    loader.free();
  }
}

/**
 * Only the header and metadata at the start of the file are read, so that
 * a large save does not go into wasm memory.
 */
export async function readEu5Header(file: File): Promise<SaveHeader> {
  await ready;
  const start = await readFileStart(file, wasm_eu5.save_header_max_len());
  const prefixLen = wasm_eu5.save_metadata_prefix_len(start);
  const meta =
    prefixLen === undefined
      ? readWholeFileMeta(new Uint8Array(await file.arrayBuffer()))
      : wasm_eu5.read_save_metadata_prefix(await readFileStart(file, prefixLen));
  return { playthroughId: toPlaythroughId(meta.playthroughId), date: meta.date };
}
