import type { LocationProfile } from "@/wasm/wasm_eu5";
import { Figure } from "../../../components/Figure";
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
        <StatItem boxed label="Development" value={<Figure value={s.development} />} />
        <StatItem boxed label="Population" value={<Figure value={s.population} form="count" />} />
        <StatItem boxed label="Control" value={<Figure value={s.control} form="percent" />} />
        <StatItem boxed label="RGO Level" value={<Figure value={s.rgoLevel} form="level" />} />
        <StatItem
          boxed
          label="Market Access"
          value={<Figure value={s.marketAccess} form="percent" />}
        />
        <StatItem boxed label="Tax Base" value={<Figure value={s.taxBase} />} />
        <StatItem boxed label="Wealth" value={<Figure value={s.wealth} />} />
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
