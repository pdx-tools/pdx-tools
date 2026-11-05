import { useMemo } from "react";
import { insightFlow } from "../../stack/levelBody";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { CountryUnrealizedTaxBase } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt, formatMetric, formatPercent as formatShare } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartDataZoomSlider,
  chartNumberText,
  neutralMark,
  chartInk,
  chartTooltip,
  getEChartsTheme,
  chartGutter,
  yAxisName,
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
import {
  countryDotSeries,
  useScatterMarks,
  logAxis,
  logDomain,
  LogFloorNote,
  logPosition,
  scatterDots,
} from "./countryScatter";
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
    <InsightReadout figure={formatMetric(data.unrealizedTaxBase)} unit="tax base gap">
      <ReadoutFigure
        value={formatShare(data.unrealizedRatio)}
        label={`of ${formatMetric(data.totalWealth)} wealth`}
      />
      <ReadoutFigure value={formatShare(data.topDecileShare)} label="in the top 10% of locations" />
    </InsightReadout>
  );
}

export function UnrealizedTaxBaseInsight() {
  const insightQuery = useEu5SelectionTrigger((engine) =>
    engine.queries.getUnrealizedTaxBaseInsight(),
  );

  const countries = insightQuery.data?.countries ?? [];

  return (
    <div className={insightFlow}>
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
              <SectionTitle>Realization Distribution</SectionTitle>
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
    `Tax Base: ${formatFloat(d.totalTaxBase, 2)}`,
    `Wealth: ${formatFloat(d.totalWealth, 2)}`,
    `Tax Base Gap: ${formatFloat(d.unrealizedTaxBase, 2)}`,
    `Realization: ${formatFloat(d.realizationRatio * 100, 1)}%`,
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
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    const showZoom = sorted.length > BAR_CAP;

    return {
      grid: {
        // The grid takes the width of the longest name, so no name is cut.
        containLabel: true,
        left: 8,
        right: 70,
        top: 10,
        bottom: 22,
      },
      xAxis: {
        type: "value",
        name: "Tax Base Gap",
        nameLocation: "middle",
        nameGap: 26,
        nameTextStyle: { color: tickColor, fontSize: 12 },
        axisLabel: { color: tickColor, fontSize: 12 },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: {
          lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5, width: 1 },
        },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: sorted.map((d) => d.country.country.name),
        axisLabel: { color: tickColor, fontSize: 12, interval: 0 },
        axisLine: { lineStyle: { color: axisColor } },
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
          barMaxWidth: 10,
          label: {
            ...chartNumberText,
            show: true,
            position: "right",
            formatter: (params) => {
              const d = params.data as CountryUnrealizedTaxBase & { value: number };
              return formatShare(d.realizationRatio);
            },
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

function UnrealizedTaxBaseScatterChart({ countries }: { countries: CountryUnrealizedTaxBase[] }) {
  const { selected, home, namePlayers, plot, track } = useScatterMarks();
  // One extent for both axes, so that the diagonal stays a diagonal.
  const domain = useMemo(
    () => logDomain(countries.flatMap((c) => [c.totalTaxBase, c.totalWealth])),
    [countries],
  );

  const scatterData = useMemo(
    () =>
      scatterDots(
        countries.map((c) => ({
          ...c,
          x: c.totalTaxBase,
          y: logPosition(c.totalWealth, domain),
          tag: c.country.tag,
          name: c.country.country.name,
          color: c.country.colorHex,
          player: c.country.isPlayer,
          id: c.country.country.key,
        })),
        domain,
        selected,
        home,
        namePlayers,
      ),
    [countries, domain, selected, home, namePlayers],
  );

  const option = useMemo((): EChartsOption => {
    return {
      grid: { ...chartGutter, top: 28, bottom: 52 },
      xAxis: logAxis(domain, "Tax Base"),
      yAxis: { ...logAxis(domain, ""), ...yAxisName("Total Wealth (ceiling)") },
      dataZoom: [{ type: "inside", xAxisIndex: 0, yAxisIndex: 0 }],
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = params.data as (typeof scatterData)[number];
          return [
            `<strong>${escapeEChartsHtml(d.country.country.name)}</strong> (${escapeEChartsHtml(d.country.tag)})`,
            `Tax Base: ${formatFloat(d.totalTaxBase, 2)}`,
            `Wealth: ${formatFloat(d.totalWealth, 2)}`,
            `Tax Base Gap: ${formatFloat(d.unrealizedTaxBase, 2)}`,
            `Realization: ${formatFloat(d.realizationRatio * 100, 1)}%`,
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
            [domain.floor, domain.floor],
            [domain.ceiling, domain.ceiling],
          ],
          lineStyle: { type: "dashed", color: chartInk.muted, width: 1 },
          symbol: "none",
          silent: true,
          tooltip: { show: false },
        },
        {
          ...countryDotSeries(scatterData, plot),
          symbolSize: (_val, params) => {
            const d = params.data as (typeof scatterData)[number];
            return Math.max(6, Math.min(28, Math.sqrt(d.locationCount)));
          },
        },
      ],
    };
  }, [scatterData, domain, plot]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    getTarget: (params) => {
      const countryRef = (params.data as (typeof scatterData)[number] | undefined)?.country;
      return countryRef
        ? {
            id: countryRef.country.key,
            anchorLocationIdx: countryRef.anchorLocationIdx,
            label: countryRef.country.name,
          }
        : null;
    },
  });

  return (
    <>
      <EChart
        option={option}
        style={{ height: "420px", width: "100%" }}
        onInit={(chart) => {
          handleInit(chart);
          track(chart);
        }}
      />
      <LogFloorNote domain={domain} what="tax base or wealth" />
    </>
  );
}
