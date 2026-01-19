import { useMemo, useState } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { TradeGoodsData, TradeGoodByType, MarketTradeGood, CountryTradeGood } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { isDarkMode } from "@/lib/dark";
import { escapeEChartsHtml } from "@/components/viz/EChart";

type ViewType = "type" | "market" | "country";

interface TradeGoodsProductionProps {
  data: TradeGoodsData;
}

export const TradeGoodsProduction = ({ data }: TradeGoodsProductionProps) => {
  const [view, setView] = useState<ViewType>("type");
  const [topN, setTopN] = useState(25);
  const [searchFilter, setSearchFilter] = useState("");

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* View Selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setView("type")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              view === "type"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            By Good Type
          </button>
          <button
            onClick={() => setView("market")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              view === "market"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            By Market
          </button>
          <button
            onClick={() => setView("country")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              view === "country"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            By Country
          </button>
        </div>

        {/* Top N Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Top N:
          </label>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {/* Search Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Search:
          </label>
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter by name..."
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
          />
        </div>
      </div>

      {/* Chart */}
      <div className="w-full">
        {view === "type" && (
          <ByTypeChart data={data.byType} topN={topN} searchFilter={searchFilter} />
        )}
        {view === "market" && (
          <ByMarketChart data={data.byMarket} topN={topN} searchFilter={searchFilter} />
        )}
        {view === "country" && (
          <ByCountryChart data={data.byCountry} topN={topN} searchFilter={searchFilter} />
        )}
      </div>

      {/* Data Table */}
      <div className="w-full max-w-7xl self-center">
        {view === "type" && (
          <ByTypeTable data={data.byType} topN={topN} searchFilter={searchFilter} />
        )}
        {view === "market" && (
          <ByMarketTable data={data.byMarket} topN={topN} searchFilter={searchFilter} />
        )}
        {view === "country" && (
          <ByCountryTable data={data.byCountry} topN={topN} searchFilter={searchFilter} />
        )}
      </div>
    </div>
  );
};

// By Type Chart - Stacked Bar Chart
function ByTypeChart({ data, topN, searchFilter }: { data: TradeGoodByType[]; topN: number; searchFilter: string }) {
  const isDark = isDarkMode();

  const option = useMemo((): EChartsOption => {
    // Filter and limit data
    const filteredData = data
      .filter((d) => d.goodName.toLowerCase().includes(searchFilter.toLowerCase()))
      .slice(0, topN);

    const goodNames = filteredData.map((d) => d.goodName);

    // Collect all unique countries
    const countriesSet = new Set<string>();
    filteredData.forEach((good) => {
      good.countryBreakdown.forEach((country) => {
        countriesSet.add(country.tag);
      });
    });

    // Create series for each country
    const countries = Array.from(countriesSet);
    const seriesData = countries.map((countryTag) => {
      const productions = filteredData.map((good) => {
        const countryData = good.countryBreakdown.find((c) => c.tag === countryTag);
        return countryData ? countryData.production : 0;
      });

      // Find country name from first occurrence
      let countryName = countryTag;
      for (const good of filteredData) {
        const countryData = good.countryBreakdown.find((c) => c.tag === countryTag);
        if (countryData) {
          countryName = countryData.countryName;
          break;
        }
      }

      return {
        name: `${countryName} (${countryTag})`,
        type: "bar" as const,
        stack: "total",
        data: productions,
        emphasis: { focus: "series" as const },
      };
    });

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          if (!Array.isArray(params) || params.length === 0) {
            return "";
          }

          const goodName = params[0].name;
          let tooltip = `<strong>${escapeEChartsHtml(String(goodName))}</strong><br/>`;

          let total = 0;
          params.forEach((p) => {
            const value = Number(p.value);
            if (value > 0) {
              tooltip += `${escapeEChartsHtml(String(p.seriesName))}: ${formatFloat(value, 1)}<br/>`;
              total += value;
            }
          });

          tooltip += `<strong>Total: ${formatFloat(total, 1)}</strong>`;
          return tooltip;
        },
      },
      legend: {
        type: "scroll",
        orient: "horizontal",
        bottom: 0,
        textStyle: {
          color: isDark ? "#bbb" : "#666",
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "15%",
        top: "10%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: goodNames,
        axisLabel: {
          rotate: 45,
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
      },
      yAxis: {
        type: "value",
        name: "Production (RGO Level)",
        nameTextStyle: {
          color: isDark ? "#fff" : "#000",
          fontSize: 12,
          fontWeight: 600,
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
          lineStyle: {
            type: "dashed",
            color: isDark ? "#444" : "#ccc",
            opacity: 0.5,
          },
        },
      },
      series: seriesData,
    };
  }, [data, topN, searchFilter, isDark]);

  return <EChart option={option} style={{ height: "600px", width: "100%" }} />;
}

// By Market Chart - Simple Bar Chart
function ByMarketChart({ data, topN, searchFilter }: { data: MarketTradeGood[]; topN: number; searchFilter: string }) {
  const isDark = isDarkMode();

  const option = useMemo((): EChartsOption => {
    const filteredData = data
      .filter((d) =>
        d.marketName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        d.goodName.toLowerCase().includes(searchFilter.toLowerCase())
      )
      .slice(0, topN);

    const labels = filteredData.map((d) => `${d.marketName} - ${d.goodName}`);
    const productions = filteredData.map((d) => d.production);

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          if (!Array.isArray(params) || params.length === 0) {
            return "";
          }

          const p = params[0];
          const d = filteredData[p.dataIndex];

          return `
            <strong>${escapeEChartsHtml(d.marketName)}</strong><br/>
            Good: ${escapeEChartsHtml(d.goodName)}<br/>
            Production: ${formatFloat(d.production, 1)}<br/>
            Supply: ${formatFloat(d.supply, 1)}<br/>
            Demand: ${formatFloat(d.demand, 1)}<br/>
            Price: ${formatFloat(d.price, 2)}
          `;
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "15%",
        top: "10%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: {
          rotate: 45,
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
      },
      yAxis: {
        type: "value",
        name: "Production (RGO Level)",
        nameTextStyle: {
          color: isDark ? "#fff" : "#000",
          fontSize: 12,
          fontWeight: 600,
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
          lineStyle: {
            type: "dashed",
            color: isDark ? "#444" : "#ccc",
            opacity: 0.5,
          },
        },
      },
      series: [
        {
          type: "bar",
          data: productions,
          itemStyle: {
            color: isDark ? "#93c5fd" : "#3b82f6",
          },
        },
      ],
    };
  }, [data, topN, searchFilter, isDark]);

  return <EChart option={option} style={{ height: "600px", width: "100%" }} />;
}

// By Country Chart - Simple Bar Chart
function ByCountryChart({ data, topN, searchFilter }: { data: CountryTradeGood[]; topN: number; searchFilter: string }) {
  const isDark = isDarkMode();

  const option = useMemo((): EChartsOption => {
    const filteredData = data
      .filter((d) =>
        d.countryName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        d.goodName.toLowerCase().includes(searchFilter.toLowerCase())
      )
      .slice(0, topN);

    const labels = filteredData.map((d) => `${d.countryName} - ${d.goodName}`);
    const productions = filteredData.map((d) => d.production);

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          if (!Array.isArray(params) || params.length === 0) {
            return "";
          }

          const p = params[0];
          const d = filteredData[p.dataIndex];

          return `
            <strong>${escapeEChartsHtml(d.countryName)}</strong> (${escapeEChartsHtml(d.tag)})<br/>
            Good: ${escapeEChartsHtml(d.goodName)}<br/>
            Production: ${formatFloat(d.production, 1)}<br/>
            Locations: ${formatInt(d.locationCount)}
          `;
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "15%",
        top: "10%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: {
          rotate: 45,
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
      },
      yAxis: {
        type: "value",
        name: "Production (RGO Level)",
        nameTextStyle: {
          color: isDark ? "#fff" : "#000",
          fontSize: 12,
          fontWeight: 600,
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
          lineStyle: {
            type: "dashed",
            color: isDark ? "#444" : "#ccc",
            opacity: 0.5,
          },
        },
      },
      series: [
        {
          type: "bar",
          data: productions,
          itemStyle: {
            color: isDark ? "#93c5fd" : "#3b82f6",
          },
        },
      ],
    };
  }, [data, topN, searchFilter, isDark]);

  return <EChart option={option} style={{ height: "600px", width: "100%" }} />;
}

// Data Tables
const byTypeColumnHelper = createColumnHelper<TradeGoodByType>();
const byTypeColumns = [
  byTypeColumnHelper.accessor("goodName", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Good" />,
    cell: (info) => info.getValue(),
  }),
  byTypeColumnHelper.accessor("totalProduction", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Total Production" />,
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 1),
  }),
  byTypeColumnHelper.accessor("locationCount", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Locations" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

function ByTypeTable({ data, topN, searchFilter }: { data: TradeGoodByType[]; topN: number; searchFilter: string }) {
  const filteredData = useMemo(
    () =>
      data
        .filter((d) => d.goodName.toLowerCase().includes(searchFilter.toLowerCase()))
        .slice(0, topN),
    [data, topN, searchFilter]
  );

  return <DataTable className="w-full" columns={byTypeColumns} data={filteredData} pagination={true} />;
}

const byMarketColumnHelper = createColumnHelper<MarketTradeGood>();
const byMarketColumns = [
  byMarketColumnHelper.accessor("marketName", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Market" />,
    cell: (info) => info.getValue(),
  }),
  byMarketColumnHelper.accessor("goodName", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Good" />,
    cell: (info) => info.getValue(),
  }),
  byMarketColumnHelper.accessor("production", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Production" />,
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 1),
  }),
  byMarketColumnHelper.accessor("supply", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Supply" />,
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 1),
  }),
  byMarketColumnHelper.accessor("demand", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Demand" />,
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 1),
  }),
  byMarketColumnHelper.accessor("price", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Price" />,
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 2),
  }),
];

function ByMarketTable({ data, topN, searchFilter }: { data: MarketTradeGood[]; topN: number; searchFilter: string }) {
  const filteredData = useMemo(
    () =>
      data
        .filter((d) =>
          d.marketName.toLowerCase().includes(searchFilter.toLowerCase()) ||
          d.goodName.toLowerCase().includes(searchFilter.toLowerCase())
        )
        .slice(0, topN),
    [data, topN, searchFilter]
  );

  return <DataTable className="w-full" columns={byMarketColumns} data={filteredData} pagination={true} />;
}

const byCountryColumnHelper = createColumnHelper<CountryTradeGood>();
const byCountryColumns = [
  byCountryColumnHelper.accessor("countryName", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Country" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-slate-400">{row.original.tag}</span>
        <span>{row.original.countryName}</span>
      </div>
    ),
  }),
  byCountryColumnHelper.accessor("goodName", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Good" />,
    cell: (info) => info.getValue(),
  }),
  byCountryColumnHelper.accessor("production", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Production" />,
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 1),
  }),
  byCountryColumnHelper.accessor("locationCount", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Locations" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

function ByCountryTable({ data, topN, searchFilter }: { data: CountryTradeGood[]; topN: number; searchFilter: string }) {
  const filteredData = useMemo(
    () =>
      data
        .filter((d) =>
          d.countryName.toLowerCase().includes(searchFilter.toLowerCase()) ||
          d.goodName.toLowerCase().includes(searchFilter.toLowerCase())
        )
        .slice(0, topN),
    [data, topN, searchFilter]
  );

  return <DataTable className="w-full" columns={byCountryColumns} data={filteredData} pagination={true} />;
}
