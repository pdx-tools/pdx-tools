import { useCallback, useEffect, useMemo } from "react";
import { useTagFilter } from "../../store";
import { useAnalysisWorker } from "../../worker";
import { EChart, useVisualizationDispatch } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { Alert } from "@/components/Alert";
import type { CountriesManaExpenditure } from "@/wasm/wasm_eu4";
import { formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { createCsv } from "@/lib/csv";
import { manaSpendAliases } from "../../features/country-details/data";

const aliases = manaSpendAliases();

// Deterministic hash for jitter based on country tag
function tagHash(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) | 0;
  }
  return ((h & 0x7fffffff) % 1000) / 1000; // 0..1
}

export const ManaExpenditure = () => {
  const countryFilter = useTagFilter();
  const { data, error } = useAnalysisWorker(
    useCallback(
      (worker) =>
        worker.eu4GetCountriesMana({
          ...countryFilter,
          ai: countryFilter.ai === "all" ? "alive" : countryFilter.ai,
        }),
      [countryFilter],
    ),
  );
  const visualizationDispatch = useVisualizationDispatch();

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        if (data === undefined || data.length < 1) {
          return "";
        }

        const rows: Record<string, string | number>[] = [];
        for (const entry of data) {
          for (const [field, label] of aliases) {
            const val = entry.mana.adm[field] + entry.mana.dip[field] + entry.mana.mil[field];
            if (val !== 0) {
              rows.push({
                name: entry.country.name,
                tag: entry.country.tag,
                category: label,
                adm: entry.mana.adm[field],
                dip: entry.mana.dip[field],
                mil: entry.mana.mil[field],
                total: val,
              });
            }
          }
        }

        return createCsv(rows, ["name", "tag", "category", "adm", "dip", "mil", "total"]);
      },
    });
  }, [data, visualizationDispatch]);

  if (error) {
    return <Alert.Error msg={error} />;
  }

  if (data === undefined) {
    return null;
  }

  return <ManaExpenditureChart data={data} />;
};

interface ScatterPoint {
  value: [number, number];
  tag: string;
  name: string;
  category: string;
  color: string;
}

function ManaExpenditureChart({ data }: { data: CountriesManaExpenditure }) {
  const isDark = isDarkMode();

  const { categoryLabels, scatterData } = useMemo(() => {
    // Determine which categories have any non-zero values, sorted alphabetically
    // (reversed so A is at the top of the chart)
    const categoryLabels = aliases
      .filter(([field]) =>
        data.some((e) => e.mana.adm[field] + e.mana.dip[field] + e.mana.mil[field] > 0),
      )
      .map(([, label]) => label)
      .sort((a, b) => b.localeCompare(a));

    const categoryIndex = new Map(categoryLabels.map((label, i) => [label, i]));

    // Build scatter data points
    const scatterData: ScatterPoint[] = [];
    for (const entry of data) {
      const jitterBase = tagHash(entry.country.tag);

      for (const [field, label] of aliases) {
        const val = entry.mana.adm[field] + entry.mana.dip[field] + entry.mana.mil[field];
        if (val <= 0) continue;

        const catIdx = categoryIndex.get(label);
        if (catIdx === undefined) continue;

        // Jitter: ±0.3 around the category index
        const jitter = (jitterBase - 0.5) * 0.6;

        scatterData.push({
          value: [val, catIdx + jitter],
          tag: entry.country.tag,
          name: entry.country.name,
          category: label,
          color: entry.color,
        });
      }
    }

    return { categoryLabels, scatterData };
  }, [data]);

  const option = useMemo((): EChartsOption => {
    return {
      grid: {
        left: 140,
        right: 30,
        top: 10,
        bottom: 40,
      },
      xAxis: {
        type: "log",
        name: "Mana Spent",
        nameLocation: "middle",
        nameGap: 25,
        min: 10,
        nameTextStyle: {
          color: isDark ? "#ddd" : "#333",
          fontSize: 12,
        },
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: "dashed",
            color: isDark ? "#ddd" : "#333",
            opacity: 0.3,
            width: 1,
          },
        },
      },
      yAxis: {
        type: "value",
        min: -0.5,
        max: categoryLabels.length - 0.5,
        interval: 1,
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
          fontSize: 11,
          formatter: (value: number) => {
            const idx = Math.round(value);
            return categoryLabels[idx] ?? "";
          },
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: "dashed",
            color: isDark ? "#ddd" : "#333",
            opacity: 0.15,
            width: 1,
          },
        },
        axisTick: {
          show: false,
        },
      },
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) {
            return "";
          }

          const d = params.data as ScatterPoint;
          return `
            <strong>${escapeEChartsHtml(d.name)}</strong> (${escapeEChartsHtml(d.tag)})<br/>
            ${escapeEChartsHtml(d.category)}: ${formatInt(d.value[0])}
          `;
        },
      },
      series: [
        {
          type: "scatter",
          data: scatterData,
          symbolSize: 6,
          itemStyle: {
            color: (params) => {
              const d = params.data as ScatterPoint;
              return d.color;
            },
            opacity: 0.8,
          },
          label: {
            show: false,
          },
        },
      ],
    };
  }, [categoryLabels, scatterData, isDark]);

  const chartHeight = Math.max(categoryLabels.length * 28 + 80, 200);

  return <EChart option={option} style={{ height: `${chartHeight}px`, width: "100%" }} />;
}
