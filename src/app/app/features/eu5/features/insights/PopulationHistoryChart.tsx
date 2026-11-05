import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartTooltip,
  getEChartsTheme,
  chartGutter,
  yAxisName,
} from "@/components/viz/echartsTheme";
import type { CountryRef } from "@/wasm/wasm_eu5";
import { SectionTitle } from "../../components";
import { useEu5SaveDate } from "../../store";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { formatPeople } from "./populationFormatting";
import { roundYearOffsets } from "./histogramAxis";
import { pointLabel, pointsToSave } from "../../stack/yearlySeries";
import { formatLongDate } from "@/features/timeline/date";

export type PopulationHistorySeries = {
  country: CountryRef;
  totalPopulation: number;
  historicalPopulation: number[];
  greatPowerRank: number;
};

const HISTORY_TOP_COUNT = 10;

/**
 * Yearly population back to the start of the campaign. Over the whole map it
 * shows the great powers and the player; over a selection it shows the most
 * populous selected countries. A partly selected country has no history: the
 * sample is country-wide.
 */
export function PopulationHistoryChart({
  countries,
  scopeIsEmpty,
}: {
  countries: PopulationHistorySeries[];
  scopeIsEmpty: boolean;
}) {
  const saveDate = useEu5SaveDate();

  const filtered = useMemo(() => {
    const withHistory = countries.filter((c) => c.historicalPopulation.length >= 2);
    if (!scopeIsEmpty) {
      return [...withHistory]
        .sort((a, b) => b.totalPopulation - a.totalPopulation)
        .slice(0, HISTORY_TOP_COUNT);
    }
    const topRanked = withHistory
      .filter((c) => c.greatPowerRank > 0)
      .sort((a, b) => a.greatPowerRank - b.greatPowerRank)
      .slice(0, HISTORY_TOP_COUNT)
      .map((c) => c.country.tag);
    const keep = new Set(topRanked);
    return withHistory.filter((c) => keep.has(c.country.tag) || c.country.isPlayer);
  }, [countries, scopeIsEmpty]);

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    const baseYear = saveDate?.year ?? 0;

    const series = filtered.map((c) => {
      return {
        name: c.country.country.name,
        type: "line" as const,
        smooth: true,
        showSymbol: false,
        color: c.country.colorHex,
        lineStyle: { color: c.country.colorHex, width: 2 },
        itemStyle: { color: c.country.colorHex },
        data: pointsToSave(c.historicalPopulation, saveDate, c.totalPopulation)
          .filter(([, v]) => v !== 0)
          .map(([x, v]) => [x - baseYear, v]),
      };
    });

    const minX = filtered.reduce((min, c) => Math.min(min, 1 - c.historicalPopulation.length), 0);

    const yearTicks = roundYearOffsets(minX, baseYear);

    return {
      legend: {
        type: "scroll",
        bottom: 0,
        textStyle: { color: tickColor, fontSize: 12 },
        pageTextStyle: { color: tickColor },
      },
      grid: { ...chartGutter, top: 28, bottom: 56 },
      xAxis: {
        type: "value",
        min: minX,
        max: "dataMax",
        axisLabel: {
          color: tickColor,
          customValues: yearTicks,
          formatter: (value: number) => String(baseYear + value),
        },
        axisTick: { customValues: yearTicks },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.35 } },
      },
      yAxis: {
        type: "value",
        ...yAxisName("Population"),
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
      },
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          if (arr.length === 0) return "";
          const firstVal = arr[0]?.value;
          const year = pointLabel(
            baseYear + Number(Array.isArray(firstVal) ? firstVal[0] : 0),
            formatLongDate(saveDate),
          );
          const lines = arr
            .filter((p) => Array.isArray(p.value))
            .map(
              (p) =>
                `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${escapeEChartsHtml(String(p.color))};margin-right:4px"></span>${escapeEChartsHtml(String(p.seriesName))}: ${formatPeople(Number((p.value as number[])[1]))}`,
            );
          return `<strong>${year}</strong><br/>${lines.join("<br/>")}`;
        },
      },
      series,
    };
  }, [filtered, saveDate]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    getTarget: (params) => {
      const c = params.seriesIndex != null ? filtered[params.seriesIndex] : null;
      return c
        ? {
            id: c.country.country.key,
            anchorLocationIdx: c.country.anchorLocationIdx,
            label: c.country.country.name,
          }
        : null;
    },
  });

  if (filtered.length === 0) return null;

  return (
    <section>
      <SectionTitle>
        {scopeIsEmpty ? "Great power population over time" : "Population over time"}
      </SectionTitle>
      <EChart option={option} style={{ height: "260px", width: "100%" }} onInit={handleInit} />
    </section>
  );
}
