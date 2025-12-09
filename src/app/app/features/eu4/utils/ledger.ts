import type { LocalizedLedger } from "@/wasm/wasm_eu4";
import type { LedgerDatum } from "../types/models";

export function workLedgerData(data: LocalizedLedger): LedgerDatum[] {
  const localize = new Map(data.localization.map((x) => [x.tag, x.name]));
  return data.points.map((x) => ({
    ...x,
    name: localize.get(x.tag) || x.tag,
    value: x.value ?? null,
  }));
}
