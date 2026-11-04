import type { LocationProfile } from "@/wasm/wasm_eu5";
import { formatCount } from "@/lib/format";
import { RankRow } from "../../../stack/ModeRanking";
import { Note } from "../../../stack/parts";

interface Props {
  profile: LocationProfile;
}

/** The buildings of a location, the highest level first. The crumb names the level. */
export function LocationEconomyTab({ profile }: Props) {
  if (profile.buildings.length === 0) {
    return <Note>No buildings.</Note>;
  }

  const buildings = [...profile.buildings].sort(
    (a, b) => b.level - a.level || a.building.name.localeCompare(b.building.name),
  );
  const largest = Math.max(0, ...buildings.map((b) => b.level));

  return (
    <>
      {buildings.map((b) => (
        <RankRow
          key={b.building.key}
          flush
          row={{ key: b.building.key, name: b.building.name, color: "", value: b.level }}
          display={formatCount(b.level)}
          fraction={largest > 0 ? b.level / largest : 0}
        />
      ))}
    </>
  );
}
