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
  seriesColor,
  yAxisName,
  labelHalo,
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

type ScatterDatum = [x: number, y: number];

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
    backLabel: "Tax Base Gap",
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

function UnrealizedTaxBaseScatterChart({ countries }: { countries: CountryUnrealizedTaxBase[] }) {
  const topCountries = useMemo(
    () => new Set(countries.slice(0, 10).map((c) => c.country.tag)),
    [countries],
  );

  const scatterData = useMemo(
    (): ScatterDatum[] => countries.map((c) => [c.totalTaxBase, c.totalWealth]),
    [countries],
  );

  const diagonalMax = useMemo(() => {
    const maxVal = Math.max(...countries.map((c) => Math.max(c.totalTaxBase, c.totalWealth)));
    return maxVal > 0 ? maxVal : 1;
  }, [countries]);

  const option = useMemo((): EChartsOption => {
    return {
      grid: { left: 56, right: 60, top: 32, bottom: 76 },
      xAxis: {
        type: "value",
        name: "Tax Base",
        nameLocation: "middle",
        nameGap: 40,
        min: 0,
      },
      yAxis: {
        type: "value",
        ...yAxisName("Total Wealth (ceiling)"),
        min: 0,
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0, yAxisIndex: 0 },
        { ...chartDataZoomSlider, type: "slider", xAxisIndex: 0, bottom: 0, height: 20 },
      ],
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const dataIndex = params.dataIndex;
          if (dataIndex == null) return "";
          const d = countries[dataIndex];
          if (!d) return "";
          return [
            `<strong>${escapeEChartsHtml(d.country.country.name)}</strong> (${escapeEChartsHtml(d.country.tag)})`,
            `Tax Base: ${formatExact(d.totalTaxBase)}`,
            `Wealth: ${formatExact(d.totalWealth)}`,
            `Tax Base Gap: ${formatExact(d.unrealizedTaxBase)}`,
            `Realization: ${formatPercent(d.realizationRatio)}`,
            `Locations: ${formatInt(d.locationCount)}`,
            `Population: ${formatInt(d.totalPopulation)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          // y = x diagonal: countries on this line have tax base ≈ wealth
          type: "line",
          data: [
            [0, 0],
            [diagonalMax, diagonalMax],
          ],
          lineStyle: { type: "dashed", color: chartInk.muted, width: 1 },
          symbol: "none",
          silent: true,
          tooltip: { show: false },
        },
        {
          type: "scatter",
          data: scatterData,
          symbolSize: (_val, params) => {
            const d = countries[params.dataIndex];
            return d ? Math.max(6, Math.min(28, Math.sqrt(d.locationCount))) : 6;
          },
          itemStyle: {
            color: (params) => {
              const d = countries[params.dataIndex];
              return d?.country.colorHex ?? seriesColor(0);
            },
            opacity: 0.8,
          },
          label: {
            show: true,
            formatter: (params) => {
              const d = countries[params.dataIndex];
              return d && (topCountries.has(d.country.tag) || countries.length <= 5)
                ? d.country.tag
                : "";
            },
            ...chartText,
            ...labelHalo,
            position: "top",
            distance: 4,
          },
        },
      ],
    };
  }, [scatterData, topCountries, countries, diagonalMax]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    backLabel: "Tax Base Gap",
    getTarget: (params) => {
      const dataIndex = params.dataIndex;
      const countryRef = dataIndex == null ? null : countries[dataIndex]?.country;
      return countryRef
        ? {
            id: countryRef.country.key,
            anchorLocationIdx: countryRef.anchorLocationIdx,
            label: countryRef.country.name,
          }
        : null;
    },
  });

  return <EChart option={option} style={{ height: "420px", width: "100%" }} onInit={handleInit} />;
}
