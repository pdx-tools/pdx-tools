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
import { manaSpendAliases } from "../country-details/data";
import type { CountryManaSpend } from "../../types/models";

const aliases = manaSpendAliases();

const manaColors = {
  ADM: "#62DAAB",
  DIP: "#6395FA",
  MIL: "#647698",
} as const;

const totalManaSpend = (spend: CountryManaSpend) =>
  aliases.reduce((sum, [field]) => sum + spend[field], 0);

export const ManaTotals = () => {
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

        const rows = data.map((entry) => {
          const adm = totalManaSpend(entry.mana.adm);
          const dip = totalManaSpend(entry.mana.dip);
          const mil = totalManaSpend(entry.mana.mil);

          return {
            name: entry.country.name,
            tag: entry.country.tag,
            adm,
            dip,
            mil,
            total: adm + dip + mil,
          };
        });

        return createCsv(rows, ["name", "tag", "adm", "dip", "mil", "total"]);
      },
    });
  }, [data, visualizationDispatch]);

  if (error) {
    return <Alert.Error msg={error} />;
  }

  if (data === undefined) {
    return null;
  }

  return <ManaTotalsChart data={data} />;
};

interface ManaTotalsRow {
  name: string;
  tag: string;
  adm: number;
  dip: number;
  mil: number;
  total: number;
}

function ManaTotalsChart({ data }: { data: CountriesManaExpenditure }) {
  const isDark = isDarkMode();

  const countries = useMemo(() => {
    const totals = data
      .map((entry) => {
        const adm = totalManaSpend(entry.mana.adm);
        const dip = totalManaSpend(entry.mana.dip);
        const mil = totalManaSpend(entry.mana.mil);

        return {
          name: entry.country.name,
          tag: entry.country.tag,
          adm,
          dip,
          mil,
          total: adm + dip + mil,
        } satisfies ManaTotalsRow;
      })
      .sort((a, b) => b.total - a.total);

    return totals.reverse();
  }, [data]);

  const names = useMemo(
    () => countries.map((country) => country.name),
    [countries],
  );
  const admValues = useMemo(
    () => countries.map((country) => country.adm),
    [countries],
  );
  const dipValues = useMemo(
    () => countries.map((country) => country.dip),
    [countries],
  );
  const milValues = useMemo(
    () => countries.map((country) => country.mil),
    [countries],
  );

  const option = useMemo((): EChartsOption => {
    return {
      grid: {
        left: 120,
        right: 20,
        top: 30,
        bottom: 40,
      },
      legend: {
        top: 0,
        textStyle: {
          color: isDark ? "#bbb" : "#666",
        },
      },
      xAxis: {
        type: "value",
        name: "Mana Spent",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: {
          color: isDark ? "#ddd" : "#333",
          fontSize: 12,
        },
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
          formatter: (value: number) => formatInt(value),
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
        type: "category",
        data: names,
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
          fontSize: 11,
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
        axisTick: {
          show: false,
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        formatter: (params) => {
          if (!Array.isArray(params) || params.length === 0) {
            return "";
          }

          const country = countries[params[0]?.dataIndex ?? -1];
          if (!country) {
            return "";
          }

          return [
            `<strong>${escapeEChartsHtml(country.name)}</strong> (${escapeEChartsHtml(country.tag)})`,
            `ADM: ${formatInt(country.adm)}`,
            `DIP: ${formatInt(country.dip)}`,
            `MIL: ${formatInt(country.mil)}`,
            `Total: ${formatInt(country.total)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          name: "ADM",
          type: "bar",
          stack: "total",
          data: admValues,
          itemStyle: {
            color: manaColors.ADM,
          },
        },
        {
          name: "DIP",
          type: "bar",
          stack: "total",
          data: dipValues,
          itemStyle: {
            color: manaColors.DIP,
          },
        },
        {
          name: "MIL",
          type: "bar",
          stack: "total",
          data: milValues,
          itemStyle: {
            color: manaColors.MIL,
          },
        },
      ],
    };
  }, [admValues, countries, dipValues, isDark, milValues, names]);

  const chartHeight = Math.max(countries.length * 22 + 80, 200);

  return (
    <EChart
      option={option}
      style={{ height: `${chartHeight}px`, width: "100%" }}
    />
  );
}
