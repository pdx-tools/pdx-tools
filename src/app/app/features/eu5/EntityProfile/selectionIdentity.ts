import type { SelectionSummaryData } from "@/wasm/wasm_eu5";

export function getSelectionIdentityKey(
  selectionState: SelectionSummaryData | null | undefined,
): string {
  return [
    selectionState?.entityCount ?? 0,
    selectionState?.locationCount ?? 0,
    selectionState?.totalPopulation ?? 0,
    selectionState?.derivedEntityAnchor ?? -1,
    selectionState?.firstLocationIdx ?? -1,
    selectionState?.preset ?? "",
  ].join(":");
}
