import type { OverviewData, OverviewKey } from "@/wasm/wasm_eu5";
import { eu5Analysis } from "./analysisClient";

export async function previewOverview<K extends OverviewKey>(
  preview: { campaignId: string; id: string },
  key: K,
): Promise<OverviewData[K]> {
  const reply = await eu5Analysis.query({
    campaignId: preview.campaignId,
    selection: { kind: "ids", ids: [preview.id] },
    identity: preview.id,
    sequence: 0,
    query: { kind: "chartOverview", key },
  });
  if (reply.outcome.status === "stale" || reply.generation !== eu5Analysis.generation())
    throw new DOMException("Observation changed", "AbortError");
  const chart = reply.outcome.value;
  if (!chart) throw Error("Chart data is unavailable for this save.");
  if (chart.id !== preview.id) throw new DOMException("Observation changed", "AbortError");
  return JSON.parse(chart.json) as OverviewData[K];
}
