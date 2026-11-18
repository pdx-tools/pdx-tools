import { expose, transfer } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import init, {
  set_tokens,
  ImportLoader,
  Eu5WasmGameBundle,
  Eu5WasmLocalizationBundle,
} from "@/wasm/wasm_eu5";
import wasmUrl from "@/wasm/wasm_eu5_bg.wasm?url";
import tokenUrl from "../../../../../../assets/tokens/eu5.bin?url";
import { getBundleUrls, resolveBundleVersion } from "../bundleUrls";
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

type ChartBundles = { game: Eu5WasmGameBundle; localization: Eu5WasmLocalizationBundle };
// One parser worker handles one file at a time. Release the old compatible
// bundles when game versions change so old saves don't grow worker memory.
let cachedBundles: { version: string; value: ChartBundles } | undefined;

async function readBundle(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw Error("Could not load EU5 analysis assets");
  return new Uint8Array(await response.arrayBuffer());
}

async function chartBundles(version: string): Promise<ChartBundles> {
  const resolved = resolveBundleVersion(version);
  if (cachedBundles?.version === resolved) return cachedBundles.value;
  cachedBundles?.value.game.free();
  cachedBundles?.value.localization.free();
  cachedBundles = undefined;

  const urls = getBundleUrls(resolved);
  const [gameBytes, localizationBytes] = await Promise.all([
    readBundle(urls.game),
    readBundle(urls.loc),
  ]);
  const game = Eu5WasmGameBundle.open(gameBytes);
  try {
    const localization = Eu5WasmLocalizationBundle.open(localizationBytes);
    const value = { game, localization };
    cachedBundles = { version: resolved, value };
    return value;
  } catch (error) {
    game.free();
    throw error;
  }
}

/** Extract the snapshot with the normal full parser and release its arena. */
export async function parseImport(file: File): Promise<Eu5Snapshot> {
  await initialize();
  const parser = await ImportLoader.open(file);
  let consumed = false;
  try {
    const meta = parser.meta();
    if (!meta.playthroughId) throw Error("Save has no campaign ID");
    // Saves can still supply map and history data if chart assets are unavailable.
    const bundles = await chartBundles(`${meta.version.major}.${meta.version.minor}`).catch(
      () => null,
    );
    consumed = true;
    const snapshot = bundles
      ? parser.parse_import_with_charts(bundles.game, bundles.localization)
      : parser.parse_import();
    return transfer(snapshot, [snapshot.data.buffer]);
  } finally {
    if (!consumed) parser.free();
  }
}
expose({ parseImport });
