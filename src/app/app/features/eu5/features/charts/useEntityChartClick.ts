import { useCallback, useEffectEvent } from "react";
import type * as echarts from "echarts/core";
import type { EntityKind } from "../../useEntityActivate";
import { useEu5EntityActivate } from "../../useEntityActivate";

export function useEu5EntityChartClick(opts: {
  kind: EntityKind;
  getAnchorLocationIdx: (params: echarts.ECElementEvent) => number | null | undefined;
}) {
  const activate = useEu5EntityActivate();

  const handleClick = useEffectEvent((params: echarts.ECElementEvent) => {
    const idx = opts.getAnchorLocationIdx(params);
    if (idx == null) return;
    const ev = params.event?.event as MouseEvent | undefined;
    activate(
      { kind: opts.kind, anchorLocationIdx: idx },
      { shiftKey: !!ev?.shiftKey, altKey: !!ev?.altKey },
    );
  });

  return useCallback((chart: echarts.ECharts) => {
    chart.on("click", handleClick);
  }, []);
}
