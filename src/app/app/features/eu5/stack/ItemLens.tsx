import { useEffect } from "react";
import { formatCount, formatInt, formatMetric } from "@/lib/format";
import type { ItemLens, LensItem } from "@/wasm/wasm_eu5";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { useEu5SelectionState } from "../store";
import { useSelectedCountries } from "./selected";
import { useEu5MapHoverSource } from "../useEu5MapHoverTarget";
import { RankRow, countryRow } from "./ModeRanking";
import { Band, Finding } from "./parts";
import { setLensTitle } from "./lensTitle";
import { countOf, lensFinding } from "./selection";

const formatOf = (lens: ItemLens) => (lens.unit === "Tax base" ? formatMetric : formatCount);

function lensTitle(name: string, lens: ItemLens): string | null {
  const format = formatOf(lens);
  return lensFinding(
    name,
    lens.unit === "RGO levels" ? "RGO levels" : lens.unit.toLowerCase(),
    lens.rows.map((row) => ({
      name: row.country.country.name,
      shown: format(row.value),
      value: row.value,
    })),
    "countries",
  );
}

/**
 * One thing of a list, such as Coffee or a religion, across the countries of the scope:
 * who holds how much, and where it is on the map. It answers "which player?" for a mode
 * whose rows are not countries.
 */
export function ItemLensLevel({ item, name }: { item: LensItem; name: string }) {
  const itemKey = `${item.kind}:${"key" in item ? item.key : ""}`;
  const { data } = useEu5Trigger((engine) => engine.queries.getItemLens(item), [itemKey]);
  const selection = useEu5SelectionState();
  const selected = useSelectedCountries();
  const source = useEu5MapHoverSource();
  const ids = data?.locationIds;
  // The land that holds it stays lit while this level is open.
  useEffect(() => {
    if (!ids) return;
    source.highlightTarget({
      kind: "locations",
      locationIdxs: ids,
      key: itemKey,
    });
    return source.clear;
  }, [ids, itemKey, source]);

  const sentence = data ? lensTitle(name, data) : null;
  useEffect(() => {
    setLensTitle(sentence);
    return () => setLensTitle(null);
  }, [sentence]);

  if (!data) return null;
  const whole = selection?.preset === "players";
  const inScope = whole ? selected.length : undefined;
  const format = formatOf(data);
  const line = sentence;
  const largest = Math.max(1, ...data.rows.map((row) => row.value));
  return (
    <>
      {line ? <Finding>{line}</Finding> : null}
      <p className="px-3.5 pb-2 text-[12px] leading-snug text-game-ink-300">
        {countOf(
          data.rows.length,
          whole ? "player holds" : "country holds",
          whole ? "players hold" : "countries hold",
        )}{" "}
        any, on {countOf(data.locationIds.length, "location")}. The map lights that land. Total{" "}
        {format(data.total)}.
        {inScope !== undefined && data.rows.length < inScope
          ? ` ${formatInt(inScope - data.rows.length)} of the ${formatInt(inScope)} players hold none.`
          : ""}
      </p>
      <Band label={whole ? "Players" : "Countries"} columns={data.unit} flush />
      {data.rows.map((row) => (
        <RankRow
          key={row.country.country.key}
          row={countryRow(row.country, row.value)}
          display={format(row.value)}
          dim={`${formatInt(row.locations)} loc.`}
          fraction={row.value / largest}
        />
      ))}
    </>
  );
}
