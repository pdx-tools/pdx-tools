import { LedgerDatum, LocalizedTag } from "../types/models";

export interface LedgerDataRaw {
  points: Omit<LedgerDatum, "name">[];
  localization: LocalizedTag[];
}

export function workLedgerData(data: LedgerDataRaw): LedgerDatum[] {
  const localize = new Map(data.localization.map((x) => [x.tag, x.name]));
  return data.points.map((x) => ({
    ...x,
    name: localize.get(x.tag) || x.tag,
  }));
}
