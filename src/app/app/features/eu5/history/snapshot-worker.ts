import { expose, transfer } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import init, { set_tokens, ImportLoader } from "@/wasm/wasm_eu5";
import wasmUrl from "@/wasm/wasm_eu5_bg.wasm?url";
import tokenUrl from "../../../../../../assets/tokens/eu5.bin?url";
import type { Eu5Snapshot } from "./analysisTypes";
registerWebWorker({ self: globalThis });
let initialized: Promise<unknown> | undefined;
const initialize = () =>
  (initialized ??= (async () => {
    await init({ module_or_path: wasmUrl });
    const response = await fetch(tokenUrl);
    if (!response.ok) throw Error("Could not load EU5 parser tokens");
    set_tokens(new Uint8Array(await response.arrayBuffer()));
  })().catch((error) => {
    initialized = undefined;
    throw error;
  }));

/** Extract the snapshot with the normal full parser and release its arena. */
export async function parseImport(file: File): Promise<Eu5Snapshot> {
  await initialize();
  const parser = await ImportLoader.open(file);
  let consumed = false;
  try {
    if (!parser.meta().playthroughId) throw Error("Save has no campaign ID");
    consumed = true;
    const snapshot = parser.parse_import();
    return transfer(snapshot, [snapshot.data.buffer]);
  } finally {
    if (!consumed) parser.free();
  }
}
expose({ parseImport });
