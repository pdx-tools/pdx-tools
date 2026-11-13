import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { chartTooltip, yAxisName } from "@/components/viz/echartsTheme";
import type { CountryRef, PopulationHistory } from "@/wasm/wasm_eu5";
import { SectionTitle } from "../../components";
import { useEu5SaveDate } from "../../store";
import { useEu5EntityChartClick } from "./useEntityChartClick";
import { formatInt } from "@/lib/format";
import { firstYear, pointLabel, pointsToSave, yearAxis, yearOfDate } from "./yearlySeries";

export type PopulationHistorySeries = {
  country: CountryRef;
  totalPopulation: number;
  historicalPopulation: PopulationHistory;
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
  backLabel,
}: {
  countries: PopulationHistorySeries[];
  scopeIsEmpty: boolean;
  backLabel: string;
}) {
  const saveDate = useEu5SaveDate();

  const filtered = useMemo(() => {
    const withHistory = countries.filter((c) => c.historicalPopulation.people.length >= 2);
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
    const series = filtered.map((c) => {
      return {
        name: c.country.country.name,
        type: "line" as const,
        showSymbol: false,
        color: c.country.colorHex,
        lineStyle: { color: c.country.colorHex, width: 2 },
        itemStyle: { color: c.country.colorHex },
        // A year of the record with no people has no point.
        data: pointsToSave(c.historicalPopulation, saveDate, c.totalPopulation).filter(
          ([, v], i, all) => v !== 0 || i === all.length - 1,
        ),
      };
    });

    const start = filtered.reduce(
      (min, c) => Math.min(min, firstYear(c.historicalPopulation)),
      saveDate.year,
    );

    return {
      legend: {
        type: "scroll",
        bottom: 0,
      },
      grid: { left: 60, right: 20, top: 32, bottom: 56 },
      xAxis: yearAxis(start, yearOfDate(saveDate)),
      yAxis: {
        type: "value",
        ...yAxisName("Population"),
      },
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          if (arr.length === 0) return "";
          const firstVal = arr[0]?.value;
          const year = pointLabel(Number(Array.isArray(firstVal) ? firstVal[0] : 0), saveDate);
          const lines = arr
            .filter((p) => Array.isArray(p.value))
            .map(
              (p) =>
                `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${escapeEChartsHtml(String(p.color))};margin-right:4px"></span>${escapeEChartsHtml(String(p.seriesName))}: ${formatInt(Number((p.value as number[])[1]))}`,
            );
          return `<strong>${year}</strong><br/>${lines.join("<br/>")}`;
        },
      },
      series,
    };
  }, [filtered, saveDate]);

  const handleInit = useEu5EntityChartClick({
    kind: "country",
    backLabel,
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
