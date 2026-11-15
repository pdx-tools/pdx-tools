import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { CountryUnrealizedTaxBase } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { formatExact, formatMetric, formatPercent } from "../../numberFormatting";
import { Figure } from "../../components/Figure";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartDataZoomSlider,
  chartInk,
  chartText,
  chartTooltip,
  neutralMark,
} from "@/components/viz/echartsTheme";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { UnrealizedTaxBaseTopLocations } from "./UnrealizedTaxBaseTopLocations";
import { RealizationHistogram } from "./RealizationHistogram";
import { InsightReadout, InsightReadoutSkeleton, ReadoutFigure } from "../InsightReadout";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { CountryScatter } from "./countryScatter";
import type { CountryPoint, LogDomain, SeriesOption } from "./countryScatter";
import { SectionTitle } from "../../components";

const BAR_CAP = 25;

function UnrealizedTaxBaseScopeHeader() {
  const { data, error, loading } = useEu5SelectionTrigger((engine) =>
    engine.queries.getUnrealizedTaxBaseScope(),
  );

  if (loading && !data) return <InsightReadoutSkeleton />;
  if (error && !data) return <Eu5InsightErrorState error={error} />;
  if (!data) return null;

  // The gap is a to-do list, not a distribution: the ledger says how much of
  // the wealth it is and whether a few locations hold most of it.
  return (
    <InsightReadout figure={<Figure value={data.unrealizedTaxBase} />} unit="tax base gap">
      <ReadoutFigure
        value={<Figure value={data.unrealizedRatio} form="percent" />}
        label={
          <>
            of <Figure value={data.totalWealth} /> wealth
          </>
        }
      />
      <ReadoutFigure
        value={<Figure value={data.topDecileShare} form="percent" />}
        label="in the top 10% of locations"
      />
    </InsightReadout>
  );
}

export function UnrealizedTaxBaseInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) =>
    engine.queries.getUnrealizedTaxBaseInsight(),
  );

  const countries = insightQuery.data?.countries ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <UnrealizedTaxBaseScopeHeader />
      <p className="text-xs text-game-ink-500">
        Wealth not converted into tax base due to limited control.
      </p>
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !insightQuery.data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {countries.length >= 1 && (
            <section>
              <SectionTitle>Tax base gap by country</SectionTitle>
              <UnrealizedTaxBaseBarChart countries={countries} />
            </section>
          )}

          {countries.length >= 2 && (
            <section>
              <SectionTitle>Tax base vs wealth by country</SectionTitle>
              <UnrealizedTaxBaseScatterChart countries={countries} />
            </section>
          )}

          {countries.length >= 10 && (
            <section>
              <SectionTitle>Countries by tax realization</SectionTitle>
              <RealizationHistogram countries={countries} />
            </section>
          )}

          {insightQuery.data?.distribution && (
            <section>
              <LocationDistributionChart distribution={insightQuery.data.distribution} />
            </section>
          )}

          {insightQuery.data && insightQuery.data.topLocations.length > 0 && (
            <section>
              <SectionTitle>Top Unrealized-Tax-Base Locations</SectionTitle>
              <UnrealizedTaxBaseTopLocations locations={insightQuery.data.topLocations} />
            </section>
          )}

          {countries.length === 0 && !insightQuery.data?.distribution && (
            <Eu5InsightEmptyState title="No unrealized tax base in the selected scope." />
          )}
        </>
      )}
    </div>
  );
}

function countryTooltip(d: CountryUnrealizedTaxBase): string {
  return [
    `<strong>${escapeEChartsHtml(d.country.country.name)}</strong> (${escapeEChartsHtml(d.country.tag)})`,
    `Tax Base: ${formatExact(d.totalTaxBase)}`,
    `Wealth: ${formatExact(d.totalWealth)}`,
    `Tax Base Gap: ${formatExact(d.unrealizedTaxBase)}`,
    `Realization: ${formatPercent(d.realizationRatio)}`,
    `Locations: ${formatInt(d.locationCount)}`,
    `Population: ${formatInt(d.totalPopulation)}`,
  ].join("<br/>");
}

function UnrealizedTaxBaseBarChart({ countries }: { countries: CountryUnrealizedTaxBase[] }) {
  const sorted = useMemo(
    (): CountryUnrealizedTaxBase[] =>
      [...countries].sort((a, b) => b.unrealizedTaxBase - a.unrealizedTaxBase),
    [countries],
  );

  const hasGap = sorted.some((d) => d.unrealizedTaxBase !== 0);

  const option = useMemo((): EChartsOption => {
    const showZoom = sorted.length > BAR_CAP;

    return {
      grid: {
        left: 60,
        right: 56,
        top: 10,
        bottom: 38,
      },
      xAxis: {
        type: "value",
        name: "Tax Base Gap",
        nameLocation: "middle",
        nameGap: 26,
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: sorted.map((d) => d.country.tag),
        axisLabel: { width: 44 },
      },
      ...(showZoom
        ? {
            dataZoom: [
              {
                ...chartDataZoomSlider,
                type: "slider",
                yAxisIndex: 0,
                startValue: 0,
                endValue: BAR_CAP - 1,
                width: 14,
                right: 4,
                filterMode: "filter",
              },
            ],
          }
        : {}),
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = params.data as CountryUnrealizedTaxBase & { value: number };
          return countryTooltip(d);
        },
      },
      series: [
        {
          type: "bar",
          data: sorted.map((d) => ({ ...d, value: d.unrealizedTaxBase })),
          // `wealth - tax base` is a non-negative magnitude.
          color: neutralMark,
          // A thin bar, so that a long list of a bright neutral is not a block.
          barMaxWidth: 10,
          label: {
            ...chartText,
            show: true,
            position: "right",
            // The bar's own value. The tooltip gives the realization.
            formatter: (params) => formatMetric((params.data as { value: number }).value),
          },
        },
      ],
    };
  }, [sorted]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    getTarget: (params) => {
      const dataIndex = params.dataIndex;
      const x = dataIndex == null ? null : sorted[dataIndex];
      return x
        ? {
            id: x.country.country.key,
            anchorLocationIdx: x.country.anchorLocationIdx,
            label: x.country.country.name,
          }
        : null;
    },
  });

  if (!hasGap) {
    return (
      <p className="py-6 text-center text-sm text-game-ink-500">
        No unrealized tax base in the selected scope
      </p>
    );
  }

  const height = Math.min(sorted.length, BAR_CAP) * 18 + 68;

  return (
    <EChart option={option} style={{ height: `${height}px`, width: "100%" }} onInit={handleInit} />
  );
}

function taxBasePoint(c: CountryUnrealizedTaxBase): CountryPoint {
  return {
    country: c.country,
    x: c.totalTaxBase,
    y: c.totalWealth,
    symbolSize: Math.max(6, Math.min(28, Math.sqrt(c.locationCount))),
  };
}

function taxBaseTooltip(d: CountryUnrealizedTaxBase): string {
  return [
    `<strong>${escapeEChartsHtml(d.country.country.name)}</strong> (${escapeEChartsHtml(d.country.tag)})`,
    `Tax Base: ${formatExact(d.totalTaxBase)}`,
    `Wealth: ${formatExact(d.totalWealth)}`,
    `Tax Base Gap: ${formatExact(d.unrealizedTaxBase)}`,
    `Realization: ${formatPercent(d.realizationRatio)}`,
    `Locations: ${formatInt(d.locationCount)}`,
    `Population: ${formatInt(d.totalPopulation)}`,
  ].join("<br/>");
}

/** On this line, a country's tax base is all of its wealth */
function fullRealization(domain: LogDomain): SeriesOption[] {
  return [
    {
      type: "line",
      data: [
        [domain.floor, domain.floor],
        [domain.ceiling, domain.ceiling],
      ],
      lineStyle: { type: "dashed", color: chartInk.muted, width: 1 },
      symbol: "none",
      silent: true,
      tooltip: { show: false },
    },
  ];
}

function UnrealizedTaxBaseScatterChart({ countries }: { countries: CountryUnrealizedTaxBase[] }) {
  return (
    <CountryScatter
      rows={countries}
      point={taxBasePoint}
      tooltip={taxBaseTooltip}
      xName="Tax Base"
      yName="Total Wealth (ceiling)"
      yAxis="log"
      zeroWhat="tax base or wealth"
      under={fullRealization}
    />
  );
}
