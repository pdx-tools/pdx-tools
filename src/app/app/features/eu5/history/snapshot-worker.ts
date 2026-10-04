import { expose } from "comlink";
import init, { set_tokens, Eu5MetaParser } from "@/wasm/wasm_eu5";
import wasmUrl from "@/wasm/wasm_eu5_bg.wasm?url";
import tokenUrl from "../../../../../../assets/tokens/eu5.bin?url";
import type { Snapshot } from "./types";
import { cachedSnapshot } from "./cache";

let ready: Promise<void> | undefined;
const initialize = () =>
  (ready ??= (async () => {
    await init({ module_or_path: wasmUrl });
    const response = await fetch(tokenUrl);
    if (!response.ok) throw new Error("Could not load EU5 parser tokens");
    set_tokens(new Uint8Array(await response.arrayBuffer()));
  })());

export async function parseSnapshot(
  file: File,
): Promise<{ snapshot: Snapshot; cacheHit: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const cached = await cachedSnapshot(hash).catch(() => undefined);
  if (cached) return { snapshot: { ...cached, fileName: file.name }, cacheHit: true };
  await initialize();
  const parser = Eu5MetaParser.create().init(bytes);
  const metadata = parser.meta();
  if (!metadata.playthroughId) {
    parser.free();
    throw new Error("Save has no campaign ID; it cannot be safely joined to a timeline");
  }
  const snapshot = parser.parse_snapshot();
  const marketLabels: Record<string, string> = {};
  for (const market of snapshot.markets) {
    if (market.centerName) marketLabels[market.center] = market.centerName.replaceAll("_", " ");
  }
  return { snapshot: { ...snapshot, hash, fileName: file.name, marketLabels }, cacheHit: false };
}

expose({ parseSnapshot });
