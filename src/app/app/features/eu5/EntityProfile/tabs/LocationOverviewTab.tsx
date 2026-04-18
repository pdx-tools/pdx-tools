import type { LocationProfile } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { EntityLink } from "../EntityLink";

interface Props {
  profile: LocationProfile;
}

export function LocationOverviewTab({ profile }: Props) {
  const s = profile.stats;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatRow label="Development" value={formatFloat(s.development, 1)} />
        <StatRow label="Population" value={formatInt(s.population)} />
        <StatRow label="Control" value={formatFloat(s.control, 2)} />
        <StatRow label="RGO Level" value={formatFloat(s.rgoLevel, 1)} />
        <StatRow label="Market Access" value={formatFloat(s.marketAccess, 2)} />
        <StatRow label="Possible Tax" value={formatFloat(s.possibleTax, 2)} />
        <StatRow label="Terrain" value={s.terrain} />
        {s.religion && <StatRow label="Religion" value={s.religion} />}
        {s.rawMaterial && <StatRow label="Raw Material" value={s.rawMaterial} />}
      </div>

      {profile.header.owner && (
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            Owner
          </p>
          <EntityLink entity={profile.header.owner} />
        </div>
      )}

      {profile.header.market && (
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            Market
          </p>
          <EntityLink entity={profile.header.market} />
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
      <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </span>
      <span className="text-sm font-semibold text-slate-100">{value}</span>
    </div>
  );
}
