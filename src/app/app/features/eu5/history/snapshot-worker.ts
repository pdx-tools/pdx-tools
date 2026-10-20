import { expose, transfer } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import { snapshotId } from "@/features/campaign/analysis/descriptor";
import { collectBuffers } from "@/features/campaign/analysis/transferBuffers";
import init, { set_tokens, ImportLoader } from "@/wasm/wasm_eu5";
import type { MapImportMetadata } from "@/wasm/wasm_eu5";
import wasmUrl from "@/wasm/wasm_eu5_bg.wasm?url";
import tokenUrl from "../../../../../../assets/tokens/eu5.bin?url";
import { EU5_EXTRACTOR_VERSION } from "./analysisTypes";
import type { Eu5Payload, SaveAnalysis } from "./analysisTypes";
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

/** Extract map columns from the normal full parser and release its arena. */
export async function parseImport(file: File): Promise<SaveAnalysis> {
  await initialize();
  const parser = await ImportLoader.open(file);
  let consumed = false;
  try {
    if (!parser.meta().playthroughId) throw Error("Save has no campaign ID");
    consumed = true;
    const { observation, projection } = parser.parse_import() as Eu5Payload & {
      observation: MapImportMetadata;
    };
    if (observation.extractorVersion !== EU5_EXTRACTOR_VERSION)
      throw Error(
        `The save parser gives extractor version ${observation.extractorVersion}, but campaign analysis accepts ${EU5_EXTRACTOR_VERSION}`,
      );
    const result: SaveAnalysis = {
      descriptor: {
        ...observation,
        id: snapshotId("eu5", observation.extractorVersion, observation.contentHash),
        game: "eu5",
        artifacts: ["observations", "map"],
      },
      payload: { projection },
    };
    return transfer(result, collectBuffers(result));
  } finally {
    if (!consumed) parser.free();
  }
}
expose({ parseImport });
