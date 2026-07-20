import { timeAsync, timeSync } from "@/lib/timeit";
import init, * as diagnostics from "../../../../wasm/wasm_eu5_diagnostics";
import diagnosticsWasmPath from "../../../../wasm/wasm_eu5_diagnostics_bg.wasm?url";

const initialized = timeAsync("Load EU5 diagnostics Wasm module", () =>
  init({ module_or_path: diagnosticsWasmPath }),
);

export async function diagnoseEu5Save(saveData: ArrayBuffer, tokens: ArrayBuffer): Promise<void> {
  await initialized;
  timeSync("Set EU5 diagnostics tokens", () => diagnostics.set_tokens(new Uint8Array(tokens)));
  timeSync("Diagnose EU5 save", () => diagnostics.diagnose_save(new Uint8Array(saveData)));
}
