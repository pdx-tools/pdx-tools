import { useEffectEvent } from "react";
import type * as echarts from "echarts/core";
import type { EntityKind } from "@/wasm/wasm_eu5";
import { useAnalysisEntityNavigation } from "../profiles/useAnalysisEntityNavigation";
import { useEu5Engine } from "../../store";
import { useEu5MapHoverSource } from "../../useEu5MapHoverTarget";

type EntityChartTarget = {
  id: number;
  anchorLocationIdx: number;
  label: string;
};

export function useEu5EntityChartClick(opts: {
  kind: EntityKind;
  backLabel: string;
  getTarget: (params: echarts.ECElementEvent) => EntityChartTarget | null | undefined;
}) {
  const openEntity = useAnalysisEntityNavigation();
  const engine = useEu5Engine();
  const hoverSource = useEu5MapHoverSource();

  const handleClick = useEffectEvent((params: echarts.ECElementEvent) => {
    const target = opts.getTarget(params);
    if (target == null) return;
    const ev = params.event?.event as MouseEvent | undefined;

    if (ev?.altKey) {
      void (opts.kind === "country"
        ? engine.commands.removeCountry(target.id)
        : engine.commands.removeMarket(target.id));
      return;
    }

    void openEntity(opts.kind, target.id, target.label, target.anchorLocationIdx, opts.backLabel);
  });

  const handleMouseover = useEffectEvent((params: echarts.ECElementEvent) => {
    const target = opts.getTarget(params);
    if (target == null) {
      hoverSource.clear();
      return;
    }

    hoverSource.highlightTarget(
      opts.kind === "country"
        ? { kind: "country", countryIdx: target.id }
        : { kind: "market", marketId: target.id },
    );
  });

  const handleMouseout = useEffectEvent(() => {
    hoverSource.clear();
  });

  return (chart: echarts.ECharts) => {
    chart.on("click", handleClick);
    chart.on("mouseover", handleMouseover);
    chart.on("mouseout", handleMouseout);
  };
}
