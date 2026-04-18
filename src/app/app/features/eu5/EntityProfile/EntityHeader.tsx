import type { EntityHeader as EntityHeaderData, LocationHeader } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { EntityLink } from "./EntityLink";
import { StatItem } from "./components/StatItem";

export function EntityHeader({ header }: { header: EntityHeaderData }) {
  return (
    <div className="shrink-0 border-b border-white/10 px-4 py-3">
      <div className="mb-2 flex items-center gap-3">
        <span
          className="h-4 w-4 shrink-0 rounded-sm"
          style={{ backgroundColor: header.colorHex }}
        />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-base font-semibold text-slate-100">{header.name}</span>
            {header.tag && <span className="font-mono text-xs text-slate-500">{header.tag}</span>}
          </div>
        </div>
      </div>
      <div className="flex gap-5">
        <StatItem
          label="Locations"
          value={formatInt(header.headline.locationCount)}
          valueClassName="text-sm"
        />
        <StatItem
          label="Development"
          value={formatFloat(header.headline.totalDevelopment, 1)}
          valueClassName="text-sm"
        />
        <StatItem
          label="Population"
          value={formatInt(header.headline.totalPopulation)}
          valueClassName="text-sm"
        />
      </div>
    </div>
  );
}

export function LeafHeader({ header }: { header: LocationHeader }) {
  return (
    <div className="shrink-0 border-b border-white/10 px-4 py-3">
      <h2 className="text-base font-semibold text-slate-100">{header.name}</h2>
      {header.owner && (
        <div className="mt-1 text-sm">
          <EntityLink entity={header.owner} />
        </div>
      )}
    </div>
  );
}
