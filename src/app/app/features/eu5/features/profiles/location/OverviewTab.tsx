import type { LocationProfile } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { CountryLink, MarketLink } from "../EntityLink";
import { SectionTitle, StatItem } from "../../../components";

interface Props {
  profile: LocationProfile;
}

export function LocationOverviewTab({ profile }: Props) {
  const s = profile.stats;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatItem boxed label="Development" value={formatFloat(s.development, 1)} />
        <StatItem boxed label="Population" value={formatInt(s.population)} />
        <StatItem boxed label="Control" value={formatFloat(s.control, 2)} />
        <StatItem boxed label="RGO Level" value={formatFloat(s.rgoLevel, 1)} />
        <StatItem boxed label="Market Access" value={formatFloat(s.marketAccess, 2)} />
        <StatItem boxed label="Tax Base" value={formatFloat(s.taxBase, 2)} />
        <StatItem boxed label="Wealth" value={formatFloat(s.wealth, 2)} />
        <StatItem boxed label="Terrain" value={s.terrain} />
        {s.religion && <StatItem boxed label="Religion" value={s.religion.name} />}
        {s.rawMaterial && <StatItem boxed label="Raw Material" value={s.rawMaterial.name} />}
      </div>

      {profile.header.owner && (
        <div>
          <SectionTitle className="mb-1">Owner</SectionTitle>
          <CountryLink country={profile.header.owner} />
        </div>
      )}

      {profile.header.market && (
        <div>
          <SectionTitle className="mb-1">Market</SectionTitle>
          <MarketLink market={profile.header.market} />
        </div>
      )}
    </div>
  );
}
