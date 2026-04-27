import type React from "react";
import { useEu5Engine } from "../../store";
import { usePanToEntity } from "../../usePanToEntity";
import { formatFloat, formatInt } from "@/lib/format";
import type {
  DiplomaticSummary,
  EconomicIndicator,
  OverviewSection,
  RankedLocation,
  ReligionShare,
} from "@/wasm/wasm_eu5";
import { EntityLink } from "../EntityLink";

export function OverviewTabContent({ data }: { data: OverviewSection }) {
  return (
    <div className="flex flex-col gap-6">
      <OverviewStats overview={data} />
      <ReligionList breakdown={data.religionBreakdown} />
      <EconomicIndicatorGrid indicators={data.topEconomicIndicators} />
      <TopLocationsList locations={data.topLocationsByDevelopment} />
      {data.diplomaticSummary && <DiplomaticSummaryRow summary={data.diplomaticSummary} />}
    </div>
  );
}

function OverviewStats({ overview }: { overview: OverviewSection }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatRow label="Avg Control" value={formatFloat(overview.avgControl, 2)} />
      <StatRow label="Avg Development" value={formatFloat(overview.avgDevelopment, 1)} />
      <StatRow label="Total RGO Level" value={formatFloat(overview.totalRgoLevel, 1)} />
      <StatRow label="Total Buildings" value={formatFloat(overview.totalBuildingLevels, 1)} />
    </div>
  );
}

function ReligionList({ breakdown }: { breakdown: ReligionShare[] }) {
  if (breakdown.length === 0) return null;
  return (
    <section>
      <SectionTitle>Religions</SectionTitle>
      <ul className="flex flex-col gap-1">
        {breakdown.map((row) => (
          <li key={row.religion} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: row.colorHex }}
            />
            <span className="min-w-0 flex-1 truncate text-slate-300">{row.religion}</span>
            <span className="font-mono text-xs text-slate-400">{formatInt(row.locationCount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EconomicIndicatorGrid({ indicators }: { indicators: EconomicIndicator[] }) {
  if (indicators.length === 0) return null;
  return (
    <section>
      <SectionTitle>Economy</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {indicators.map((indicator) => (
          <StatRow
            key={indicator.label}
            label={indicator.label}
            value={formatIndicator(indicator)}
          />
        ))}
      </div>
    </section>
  );
}

function TopLocationsList({ locations }: { locations: RankedLocation[] }) {
  const engine = useEu5Engine();
  const panToEntity = usePanToEntity();
  if (locations.length === 0) return null;
  return (
    <section>
      <SectionTitle>Top locations</SectionTitle>
      <ol className="flex flex-col gap-1">
        {locations.map((location, index) => (
          <li key={location.locationIdx} className="flex items-center gap-2 text-sm">
            <span className="w-4 shrink-0 text-right font-mono text-xs text-slate-500">
              {index + 1}
            </span>
            <button
              type="button"
              onClick={() => {
                panToEntity(location.locationIdx);
                void engine.trigger.setFocusedLocation(location.locationIdx);
              }}
              className="min-w-0 flex-1 truncate text-left text-sky-300 hover:text-sky-200 hover:underline"
            >
              {location.name}
            </button>
            <span className="font-mono text-xs text-slate-400">
              {formatFloat(location.value, 1)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DiplomaticSummaryRow({ summary }: { summary: DiplomaticSummary }) {
  return (
    <section>
      <SectionTitle>Diplomacy</SectionTitle>
      <div className="flex flex-col gap-1 text-sm text-slate-300">
        {summary.overlord && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Subject of</span>
            <EntityLink entity={summary.overlord} />
          </div>
        )}
        <div>{formatInt(summary.subjectCount)} subjects</div>
      </div>
    </section>
  );
}

function formatIndicator(indicator: EconomicIndicator): string {
  if (indicator.format === "integer") {
    return formatInt(indicator.value);
  }
  if (indicator.format === "currency") {
    return formatFloat(indicator.value, 1);
  }
  return formatFloat(indicator.value, 1);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
      {children}
    </p>
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
