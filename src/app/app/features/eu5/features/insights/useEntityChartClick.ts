import { useCallback, useEffectEvent } from "react";
import type * as echarts from "echarts/core";
import type { EntityKind } from "@/wasm/wasm_eu5";
import { entityProfileEntry, usePanelNav } from "../profiles/PanelNavContext";
import { useEu5Engine } from "../../store";
import { usePanToEntity } from "../../usePanToEntity";
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
  const nav = usePanelNav();
  const engine = useEu5Engine();
  const panToEntity = usePanToEntity();
  const hoverSource = useEu5MapHoverSource();

  const handleClick = useEffectEvent((params: echarts.ECElementEvent) => {
    const target = opts.getTarget(params);
    if (target == null) return;
    const ev = params.event?.event as MouseEvent | undefined;

    if (ev?.altKey) {
      void (opts.kind === "country"
        ? engine.trigger.removeCountry(target.id)
        : engine.trigger.removeMarket(target.id));
      return;
    }

    nav.pushMany([entityProfileEntry(opts.kind, target.id, target.label)], opts.backLabel);
    panToEntity(target.anchorLocationIdx);
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

  return useCallback((chart: echarts.ECharts) => {
    chart.on("click", handleClick);
    chart.on("mouseover", handleMouseover);
    chart.on("mouseout", handleMouseout);
  }, []);
}
