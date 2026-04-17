import type { LocationProfile } from "@/wasm/wasm_eu5";
import { formatFloat } from "@/lib/format";

interface Props {
  profile: LocationProfile;
}

export function LocationEconomyTab({ profile }: Props) {
  if (profile.buildings.length === 0) {
    return <p className="text-sm text-slate-500">No buildings.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
        Buildings
      </p>
      <div className="flex flex-col gap-1">
        {profile.buildings.map((b, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-slate-300">{b.name}</span>
            <span className="font-mono text-xs text-slate-400">{formatFloat(b.level, 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
