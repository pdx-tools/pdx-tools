import type { ECharts } from "echarts/core";

// The native Sankey view recreates its graphics on update. Capture only geometry,
// then tween the replacement shapes; never retain an old canvas or full series.
type Shape = Record<string, number | string | number[]>;
type Graphic = {
  shape?: Shape;
  stopAnimation: () => void;
  animateFrom: (props: object, options: { duration: number; easing: string }) => void;
  disableLabelAnimation?: boolean;
};
type Data = {
  count: () => number;
  getId: (index: number) => string;
  getRawDataItem: (index: number) => unknown;
  getItemGraphicEl: (index: number) => Graphic | undefined;
};
type Model = { id: string; subType: string; getData: (kind?: string) => Data };
// ECharts does not publish this runtime accessor in its public TypeScript API.
// Keep its use isolated and optional so other charts do not depend on it.
type ChartModelAccess = {
  getModel?: () => { eachSeries: (visit: (model: Model) => void) => void };
};

function visitSankey(chart: ECharts, visit: (key: string, graphic: Graphic) => void) {
  const model = (chart as unknown as ChartModelAccess).getModel?.();
  model?.eachSeries((series) => {
    if (series.subType !== "sankey") return;
    for (const kind of ["node", "edge"]) {
      const data = series.getData(kind === "node" ? undefined : kind);
      for (let i = 0; i < data.count(); i++) {
        const graphic = data.getItemGraphicEl(i);
        if (!graphic?.shape) continue;
        const raw = data.getRawDataItem(i) as { source?: string; target?: string } | undefined;
        const id = kind === "edge" ? JSON.stringify([raw?.source, raw?.target]) : data.getId(i);
        visit(`${series.id}/${kind}/${id}`, graphic);
      }
    }
  });
}

export function captureSankey(chart: ECharts) {
  const shapes = new Map<string, Shape>();
  visitSankey(chart, (key, graphic) => shapes.set(key, { ...graphic.shape! }));
  return shapes;
}

export function animateSankey(chart: ECharts, previous: Map<string, Shape>) {
  if (!previous.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  visitSankey(chart, (key, graphic) => {
    graphic.stopAnimation();
    graphic.disableLabelAnimation = false;
    const shape = previous.get(key);
    graphic.animateFrom(shape ? { shape } : { style: { opacity: 0 } }, {
      duration: 800,
      easing: "cubicInOut",
    });
  });
}
