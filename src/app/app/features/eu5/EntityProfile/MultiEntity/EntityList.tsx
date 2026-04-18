import { formatFloat, formatInt } from "@/lib/format";
import type { EntityBreakdownRow, EntityRef } from "@/wasm/wasm_eu5";

interface Props {
  rows: EntityBreakdownRow[];
  onDrillIn: (anchorIdx: number, label: string) => void;
}

export function EntityList({ rows, onDrillIn }: Props) {
  // Row counts are capped by the tier routing; Rust already sorts by the active mode metric.
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => (
        <li key={row.entityRef.anchorLocationIdx}>
          <button
            type="button"
            onClick={() => onDrillIn(row.entityRef.anchorLocationIdx, row.entityRef.name)}
            className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-left transition-colors hover:border-white/10 hover:bg-white/10"
          >
            <div className="flex items-center justify-between gap-2">
              <EntityLabel entity={row.entityRef} />
              <div className="flex shrink-0 gap-4 text-right">
                <Stat label="Locs" value={formatInt(row.locationCount)} />
                <Stat label="Dev" value={formatFloat(row.totalDevelopment, 1)} />
                <Stat label="Pop" value={formatInt(row.totalPopulation)} />
              </div>
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <span className="truncate">{row.modeMetricLabel}</span>
              <span className="font-mono text-slate-400">{formatFloat(row.modeMetric, 1)}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EntityLabel({ entity }: { entity: EntityRef }) {
  return (
    <span className="inline-flex min-w-0 shrink items-center gap-1.5 text-sky-300">
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-sm"
        style={{ backgroundColor: entity.colorHex }}
      />
      {entity.tag && <span className="font-mono text-xs text-slate-500">{entity.tag}</span>}
      <span className="truncate">{entity.name}</span>
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
        {label}
      </span>
      <span className="text-xs font-semibold text-slate-200">{value}</span>
    </div>
  );
}
