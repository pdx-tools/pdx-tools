import { expose, transfer } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import { snapshotId } from "@/features/campaign/analysis/descriptor";
import { collectBuffers } from "@/features/campaign/analysis/transferBuffers";
import init, { parse_analysis, set_tokens } from "@/wasm/wasm_eu4";
import wasmUrl from "@/wasm/wasm_eu4_bg.wasm?url";
import tokenUrl from "../../../../../../assets/tokens/eu4.bin?url";
import { EU4_EXTRACTOR_VERSION } from "./analysisTypes";
import type { Eu4SaveAnalysis, ProvinceColumns } from "./analysisTypes";
import type { ProvinceImportMetadata } from "@/wasm/wasm_eu4";
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
 * Parse a complete save and keep only the province observations. The
 * campaign identity comes from the parsed game state, so the metadata does
 * not decide the campaign.
 */
export async function parseImport(file: File): Promise<Eu4SaveAnalysis> {
  await initialize();
  const data = new Uint8Array(await file.arrayBuffer());
  const { observation, provinces } = parse_analysis(data) as {
    observation: ProvinceImportMetadata;
    provinces: ProvinceColumns;
  };
  if (observation.extractorVersion !== EU4_EXTRACTOR_VERSION)
    throw Error(
      `The save parser gives extractor version ${observation.extractorVersion}, but campaign analysis accepts ${EU4_EXTRACTOR_VERSION}`,
    );
  const result: Eu4SaveAnalysis = {
    descriptor: {
      ...observation,
      id: snapshotId("eu4", observation.extractorVersion, observation.contentHash),
      game: "eu4",
      artifacts: ["observations"],
    },
    payload: { provinces },
  };
  return transfer(result, collectBuffers(result));
}
expose({ parseImport });
