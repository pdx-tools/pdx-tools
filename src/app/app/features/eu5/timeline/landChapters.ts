import { formatInt } from "@/lib/format";
import type { LandHistory } from "@/wasm/wasm_eu5";

function locations(count: number): string {
  return `${formatInt(count)} ${count === 1 ? "location" : "locations"}`;
}

export function landChapters({ peak, biggestGain, biggestLoss }: LandHistory) {
  const beats = [{ year: peak.year, text: `Peak of ${locations(peak.locations)}` }];
  if (biggestGain) {
    beats.push({
      year: biggestGain.year,
      text: `Largest gain of ${locations(biggestGain.change)}`,
    });
  }
  if (biggestLoss) {
    beats.push({
      year: biggestLoss.year,
      text: `Largest loss of ${locations(-biggestLoss.change)}`,
    });
  }
  const byYear = new Map<number, string>();
  for (const { year, text } of beats) {
    const previous = byYear.get(year);
    byYear.set(year, previous ? `${previous}. ${text}` : text);
  }
  return Array.from(byYear, ([year, text]) => ({ year, text })).sort((a, b) => a.year - b.year);
}
