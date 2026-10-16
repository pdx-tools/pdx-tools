import { expose, transfer } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import init, {
  set_tokens,
  ImportLoader,
  Eu5WasmGameBundle,
  Eu5WasmLocalizationBundle,
} from "@/wasm/wasm_eu5";
import type { SaveAnalysisImport } from "@/wasm/wasm_eu5";
import wasmUrl from "@/wasm/wasm_eu5_bg.wasm?url";
import tokenUrl from "../../../../../../assets/tokens/eu5.bin?url";
import { getBundleUrls, resolveBundleVersion } from "../bundleUrls";
import { packSnapshot } from "./packedSnapshot";
import { packOverviews } from "./packedOverview";
import { analyticalBuffers } from "./transferBuffers";
import type { MapProjection, SaveAnalysis } from "./analysisTypes";
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
export function releaseBuffer(buffer: ArrayBuffer | undefined) {
  if (!buffer?.byteLength) return;
  if (typeof buffer.transfer === "function") buffer.transfer(0);
  else if (typeof structuredClone === "function") structuredClone(buffer, { transfer: [buffer] });
}
const bundles = new Map<
  string,
  Promise<{ game: Eu5WasmGameBundle; localization: Eu5WasmLocalizationBundle }>
>();
function assets(version: string) {
  let pending = bundles.get(version);
  if (!pending) {
    pending = loadAssets(version).catch((error) => {
      bundles.delete(version);
      throw error;
    });
    bundles.set(version, pending);
  }
  return pending;
}
async function loadAssets(version: string) {
  const urls = getBundleUrls(resolveBundleVersion(version));
  const read = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw Error("Could not load EU5 analytical assets");
    return new Uint8Array(await response.arrayBuffer());
  };
  const [game, loc] = await Promise.all([read(urls.game), read(urls.loc)]);
  let openedGame: Eu5WasmGameBundle | undefined;
  try {
    openedGame = Eu5WasmGameBundle.open(game);
    return {
      game: openedGame,
      localization: Eu5WasmLocalizationBundle.open(loc),
    };
  } catch (error) {
    openedGame?.free();
    throw error;
  } finally {
    releaseBuffer(game.buffer);
    releaseBuffer(loc.buffer);
  }
}
/** Parse one full model, release its arena, and keep the worker reusable. */
export async function parseImport(file: File): Promise<SaveAnalysis> {
  await initialize();
  const parser = await ImportLoader.open(file);
  let data: Awaited<ReturnType<typeof assets>> | undefined;
  let consumed = false;
  try {
    const meta = parser.meta();
    if (!meta.playthroughId) throw Error("Save has no campaign ID");
    data = await assets(`${meta.version.major}.${meta.version.minor}`);
    consumed = true;
    const raw = parser.parse_import(data.game, data.localization) as SaveAnalysisImport & {
      projection: MapProjection;
    };
    const marketLabels: Record<string, string> = {};
    for (const market of raw.snapshot.markets)
      marketLabels[market.center] =
        market.centerName?.replaceAll("_", " ") || `Location ${market.center}`;
    const names =
      raw.countryNames instanceof Map ? Object.fromEntries(raw.countryNames) : raw.countryNames;
    const result: SaveAnalysis = {
      observation: {
        hash: `eu5:${raw.hash}`,
        campaignId: raw.snapshot.campaignId,
        date: raw.snapshot.date,
        dateSort: raw.snapshot.dateSort,
        version: raw.snapshot.version,
        layoutKey: raw.projection.layoutKey,
        fileName: file.name,
        world: raw.overviews.world,
      },
      snapshot: packSnapshot({
        ...raw.snapshot,
        hash: `eu5:${raw.hash}`,
        fileName: file.name,
        marketLabels,
      }),
      projection: raw.projection,
      overviews: packOverviews(raw.overviews),
      countryIds: Uint32Array.from(raw.countryIds),
      countryNames: names,
    };
    return transfer(result, analyticalBuffers(result));
  } finally {
    if (!consumed) parser.free();
  }
}
expose({ parseImport });
