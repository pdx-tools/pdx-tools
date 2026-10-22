import { expose, transfer } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import init, { parse_analysis, set_tokens } from "@/wasm/wasm_eu4";
import wasmUrl from "@/wasm/wasm_eu4_bg.wasm?url";
import tokenUrl from "../../../../../../assets/tokens/eu4.bin?url";
import type { Eu4Snapshot } from "./analysisTypes";
registerWebWorker({ self: globalThis });
let initialized: Promise<unknown> | undefined;
const initialize = () =>
  (initialized ??= (async () => {
    await init({ module_or_path: wasmUrl });
    const response = await fetch(tokenUrl);
    if (!response.ok) throw Error("Could not load EU4 parser tokens");
    set_tokens(new Uint8Array(await response.arrayBuffer()));
  })().catch((error) => {
    initialized = undefined;
    throw error;
  }));

/**
 * Parse a complete save and keep only its snapshot. The campaign identity
 * comes from the parsed game state, so the metadata does not decide the
 * campaign.
 */
export async function parseImport(file: File): Promise<Eu4Snapshot> {
  await initialize();
  const snapshot = parse_analysis(new Uint8Array(await file.arrayBuffer()));
  return transfer(snapshot, [snapshot.data.buffer]);
}
expose({ parseImport });
