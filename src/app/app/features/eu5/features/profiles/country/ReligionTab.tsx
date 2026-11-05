import { formatCount, formatInt, formatFixedPercent } from "@/lib/format";
import type { CountryReligionSection } from "@/wasm/wasm_eu5";
import { RankRow } from "../../../stack/ModeRanking";
import { Band, Note } from "../../../stack/parts";

/** The religions that have a row. The others share one row. */
const SHOWN = 8;

/**
 * A country's religions in order of followers. Each row has the religion's
 * colour, the followers, and the share of the population, and no bar: the long
 * tail makes it a sliver.
 */
export function ReligionTabContent({ data }: { data: CountryReligionSection }) {
  const { religionBreakdown } = data;
  if (religionBreakdown.length === 0) {
    return <Note>No religion data.</Note>;
  }

  const sorted = [...religionBreakdown].sort((a, b) => b.population - a.population);
  const total = sorted.reduce((sum, row) => sum + row.population, 0);
  // One "others" row must stand for two religions or more.
  const shown = sorted.length > SHOWN + 1 ? sorted.slice(0, SHOWN) : sorted;
  const others = sorted.slice(shown.length);
  const othersPopulation = others.reduce((sum, row) => sum + row.population, 0);

  return (
    <>
      <Band label="Religions" columns="Followers · Share" />
      {shown.map((row) => (
        <RankRow
          key={row.religion.key}
          row={{
            key: row.religion.key,
            name: row.religion.name,
            color: row.colorHex,
            value: row.population,
            title: `${formatInt(row.locationCount)} ${row.locationCount === 1 ? "location" : "locations"}`,
          }}
          display={formatCount(row.population)}
          dim={formatFixedPercent(total > 0 ? row.population / total : 0)}
        />
      ))}
      {others.length > 0 ? (
        <RankRow
          row={{
            key: "others",
            name: `${formatInt(others.length)} others`,
            color: "",
            value: othersPopulation,
          }}
          display={formatCount(othersPopulation)}
          dim={formatFixedPercent(total > 0 ? othersPopulation / total : 0)}
        />
      ) : null}
    </>
  );
}
