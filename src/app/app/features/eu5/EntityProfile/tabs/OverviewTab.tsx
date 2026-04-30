import type React from "react";
import { formatFloat, formatInt } from "@/lib/format";
import type {
  CountryOverviewSection,
  DiplomaticSummary,
  EconomicIndicator,
  LocationDistribution,
  LocationRow,
  MarketOverviewSection,
} from "@/wasm/wasm_eu5";
import { EntityLink } from "../EntityLink";
import { LocationDistributionChart } from "../../features/charts/LocationDistributionChart";

export function CountryOverviewTabContent({
  data,
  locations,
}: {
  data: CountryOverviewSection;
  locations: LocationRow[];
}) {
  const developmentDistribution = bucketLocations(
    "Development",
    locations.map((location) => location.development),
  );
  const controlDistribution = bucketLocations(
    "Control (%)",
    locations.map((location) => location.control * 100),
  );

  return (
    <div className="flex flex-col gap-4">
      <OverviewStats overview={data} />
      <LocationDistributionChart distribution={developmentDistribution} />
      <LocationDistributionChart distribution={controlDistribution} />
      <EconomicIndicatorGrid indicators={data.topEconomicIndicators} />
      <DiplomaticSummaryRow summary={data.diplomaticSummary} />
    </div>
  );
}

export function MarketOverviewTabContent({ data }: { data: MarketOverviewSection }) {
  const marketAccessDistribution =
    data.locationMarketAccess.length >= 5
      ? bucketLocations(
          "Market Access (%)",
          data.locationMarketAccess.map((value) => value * 100),
        )
      : null;
  const marketAttractionDistribution =
    data.locationMarketAttraction.length >= 5
      ? bucketLocations(
          "Market Attraction (%)",
          data.locationMarketAttraction.map((value) => value * 100),
        )
      : null;

  return (
    <div className="flex flex-col gap-4">
      <OverviewStats overview={data} />
      {marketAccessDistribution && (
        <LocationDistributionChart distribution={marketAccessDistribution} />
      )}
      {marketAttractionDistribution && (
        <LocationDistributionChart distribution={marketAttractionDistribution} />
      )}
      <EconomicIndicatorGrid indicators={data.topEconomicIndicators} />
    </div>
  );
}

function OverviewStats({ overview }: { overview: CountryOverviewSection | MarketOverviewSection }) {
  return (
    <div className="grid grid-cols-2 gap-2 @[22rem]:grid-cols-4">
      <StatRow label="Avg Control" value={formatPercent(overview.avgControl)} />
      <StatRow label="Avg Development" value={formatFloat(overview.avgDevelopment, 1)} />
      <StatRow label="Total RGO Level" value={formatFloat(overview.totalRgoLevel, 1)} />
      <StatRow label="Total Buildings" value={formatFloat(overview.totalBuildingLevels, 1)} />
    </div>
  );
}

function EconomicIndicatorGrid({ indicators }: { indicators: EconomicIndicator[] }) {
  if (indicators.length === 0) return null;
  return (
    <section>
      <SectionTitle>Economy</SectionTitle>
      <div className="grid grid-cols-2 gap-2 @[22rem]:grid-cols-3">
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

function formatPercent(value: number, digits = 1): string {
  return `${formatFloat(value * 100, digits)}%`;
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
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md border border-white/5 bg-white/5 px-2 py-1.5">
      <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </span>
      <span className="truncate text-sm font-semibold text-slate-100">{value}</span>
    </div>
  );
}

function bucketLocations(metricLabel: string, values: number[]): LocationDistribution {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return { metricLabel, buckets: [], topLocations: [] };
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  if (Math.abs(max - min) < Number.EPSILON) {
    return {
      metricLabel,
      buckets: [{ lo: min, hi: max, count: finiteValues.length }],
      topLocations: [],
    };
  }

  const targetBuckets = 20;
  const step = niceBucketStep(max - min, targetBuckets);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const bucketCount = Math.max(1, Math.min(targetBuckets * 2, Math.ceil((end - start) / step)));
  const counts = Array.from({ length: bucketCount }, () => 0);

  for (const value of finiteValues) {
    const index = Math.min(bucketCount - 1, Math.floor((value - start) / step));
    counts[index] += 1;
  }

  return {
    metricLabel,
    buckets: counts.map((count, index) => ({
      lo: start + index * step,
      hi: start + (index + 1) * step,
      count,
    })),
    topLocations: [],
  };
}

function niceBucketStep(range: number, targetBuckets: number): number {
  const rawStep = range / Math.max(1, targetBuckets);
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}
