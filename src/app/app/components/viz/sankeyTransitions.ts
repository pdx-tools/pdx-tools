import { CHART_UPDATE_DURATION, CHART_UPDATE_EASING, prefersReducedMotion } from "./chartMotion";
import { getChartModel } from "./echartsInternals";
import type { SankeyGraphic, SankeyShape } from "./echartsInternals";
import type { ECharts } from "echarts/core";

// The native Sankey view recreates its graphics on update. Capture only geometry,
// then tween the replacement shapes; never retain an old canvas or full series.
function visitSankey(chart: ECharts, visit: (key: string, graphic: SankeyGraphic) => void) {
  const model = getChartModel(chart);
  model?.eachSeries((series) => {
    if (series.subType !== "sankey") return;
    for (const kind of ["node", "edge"]) {
      const data = series.getData(kind === "node" ? undefined : kind);
      for (let i = 0; i < data.count(); i++) {
        const graphic = data.getItemGraphicEl(i) as SankeyGraphic | undefined;
        if (!graphic?.shape) continue;
        const raw = data.getRawDataItem(i) as { source?: string; target?: string } | undefined;
        const id = kind === "edge" ? JSON.stringify([raw?.source, raw?.target]) : data.getId(i);
        visit(`${series.id}/${kind}/${id}`, graphic);
      }
    }
  });
}

export function captureSankey(chart: ECharts): Map<string, SankeyShape> | undefined {
  let shapes: Map<string, SankeyShape> | undefined;
  visitSankey(chart, (key, graphic) => {
    shapes ??= new Map<string, SankeyShape>();
    shapes.set(key, { ...graphic.shape! });
  });
  return shapes;
}

export function animateSankey(
  chart: ECharts,
  previous: Map<string, SankeyShape>,
  duration = CHART_UPDATE_DURATION,
) {
  if (!previous.size || duration <= 0 || prefersReducedMotion()) return;
  visitSankey(chart, (key, graphic) => {
    graphic.stopAnimation();
    graphic.disableLabelAnimation = false;
    const shape = previous.get(key);
    if (!shape && graphic.style && graphic.style.opacity == null) {
      // ZRender's animateFrom skips properties whose target value is nullish.
      graphic.style.opacity = 1;
    }
    graphic.animateFrom(shape ? { shape } : { style: { opacity: 0 } }, {
      duration,
      easing: CHART_UPDATE_EASING,
    });
  });
}
