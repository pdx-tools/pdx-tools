import { useCallback, useEffectEvent, useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type {
  GoodMarketBalanceCell,
  ScopedGoodSummary,
  ScopedMarketSummary,
} from "@/wasm/wasm_eu5";
import { formatFloat } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { useEu5Engine } from "../../store";
import { usePanToEntity } from "../../usePanToEntity";
import type * as echarts from "echarts/core";

const MARKETS_COLS = 20;

interface Props {
  goods: ScopedGoodSummary[];
  markets: ScopedMarketSummary[];
  cells: GoodMarketBalanceCell[];
}

export function GoodsMarketsHeatmap({ goods, markets, cells }: Props) {
  const engine = useEu5Engine();
  const panToEntity = usePanToEntity();
  const isDark = isDarkMode();

  const topGoods = useMemo(() => [...goods].sort((a, b) => a.name.localeCompare(b.name)), [goods]);

  const topMarkets = useMemo(
    () =>
      [...markets]
        .sort(
          (a, b) =>
            b.shortagePressure + b.surplusPressure - (a.shortagePressure + a.surplusPressure),
        )
        .slice(0, MARKETS_COLS),
    [markets],
  );

  const goodIndex = useMemo(() => new Map(topGoods.map((g, i) => [g.name, i])), [topGoods]);
  const marketIndex = useMemo(
    () => new Map(topMarkets.map((m, i) => [m.anchorLocationIdx, i])),
    [topMarkets],
  );

  const filteredCells = useMemo(() => {
    return cells.filter((c) => goodIndex.has(c.good) && marketIndex.has(c.marketAnchorLocationIdx));
  }, [cells, goodIndex, marketIndex]);

  const maxAbs = useMemo(() => {
    let m = 0;
    for (const c of filteredCells) {
      const v = Math.abs(c.imbalanceValue);
      if (v > m) m = v;
    }
    return m > 0 ? m : 1;
  }, [filteredCells]);

  const seriesData = useMemo(
    () =>
      filteredCells.map((c) => {
        const x = marketIndex.get(c.marketAnchorLocationIdx) ?? 0;
        const y = goodIndex.get(c.good) ?? 0;
        return [x, y, c.imbalanceValue];
      }),
    [filteredCells, goodIndex, marketIndex],
  );

  const marketLabels = useMemo(
    () => topMarkets.map((m) => m.centerName.replace(/ Market$/, "")),
    [topMarkets],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, tickColor } = getEChartsTheme(isDark);

    return {
      grid: { left: 120, right: 40, top: 20, bottom: 100 },
      xAxis: {
        type: "category",
        data: marketLabels,
        axisLabel: {
          color: tickColor,
          fontSize: 10,
          rotate: 55,
          interval: 0,
          width: 90,
          overflow: "truncate",
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitArea: { show: true },
      },
      yAxis: {
        type: "category",
        data: topGoods.map((g) => g.name),
        inverse: true,
        axisLabel: { color: tickColor, fontSize: 11, fontWeight: 600, width: 110 },
        axisLine: { lineStyle: { color: axisColor } },
        splitArea: { show: true },
      },
      visualMap: {
        min: -maxAbs,
        max: maxAbs,
        show: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemWidth: 12,
        itemHeight: 80,
        precision: 0,
        text: ["Surplus", "Shortage"],
        textStyle: { color: tickColor, fontSize: 10 },
        inRange: {
          color: isDark
            ? ["#38bdf8", "#0ea5e9", "#1e293b", "#f97316", "#ef4444"]
            : ["#0ea5e9", "#7dd3fc", "#f1f5f9", "#fb923c", "#dc2626"],
        },
      },
      tooltip: {
        position: "top",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const idx = (params as { dataIndex?: number }).dataIndex;
          if (idx == null) return "";
          const c = filteredCells[idx];
          if (!c) return "";
          const marketName =
            topMarkets.find((m) => m.anchorLocationIdx === c.marketAnchorLocationIdx)?.centerName ??
            "";
          return [
            `<strong>${escapeEChartsHtml(c.good)}</strong>`,
            `<em>${escapeEChartsHtml(marketName)}</em>`,
            `Supply: ${formatFloat(c.supply, 2)}`,
            `Demand: ${formatFloat(c.demand, 2)}`,
            `Price: ${formatFloat(c.price, 2)}`,
            `Balance: ${formatFloat(c.balanceRatio, 2)}`,
            `Imbalance $: ${formatFloat(c.imbalanceValue, 0)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "heatmap",
          data: seriesData,
          label: { show: false },
          emphasis: { itemStyle: { borderColor: isDark ? "#e2e8f0" : "#1e293b", borderWidth: 1 } },
          progressive: 1000,
          animation: false,
        },
      ],
    };
  }, [isDark, marketLabels, topGoods, topMarkets, filteredCells, seriesData, maxAbs]);

  const handleClick = useEffectEvent((params: echarts.ECElementEvent) => {
    const idx = params.dataIndex;
    const c = idx == null ? undefined : filteredCells[idx];
    if (c?.marketAnchorLocationIdx == null) return;
    const mIdx = c.marketAnchorLocationIdx;
    if ((params.event?.event as MouseEvent)?.shiftKey) {
      void engine.trigger.addMarket(mIdx);
    } else if ((params.event?.event as MouseEvent)?.altKey) {
      void engine.trigger.removeMarket(mIdx);
    } else {
      void engine.trigger.selectMarket(mIdx);
      panToEntity(mIdx);
    }
  });

  const handleInit = useCallback((chart: echarts.ECharts) => {
    chart.on("click", handleClick);
  }, []);

  if (topGoods.length === 0 || topMarkets.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        Not enough scoped market data for a heatmap
      </p>
    );
  }

  const height = topGoods.length * 22 + 200;

  return (
    <EChart option={option} style={{ height: `${height}px`, width: "100%" }} onInit={handleInit} />
  );
}
