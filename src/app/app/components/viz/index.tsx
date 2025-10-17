import React, { type ComponentType, lazy, Suspense } from "react";
import type {
  LineConfig as LineConfigImpl,
  PieConfig,
  BarConfig,
  Treemap as TreemapImpl,
  ScatterConfig,
} from "@ant-design/plots";

type LineConfig = LineConfigImpl & {
  tooltip: {
    shared: boolean;
  };
};

// The imports from @ant-design/plots are to fix next.js css-npm error
// - https://github.com/ant-design/ant-design-charts/issues/1275
// - https://github.com/ant-design/ant-design-charts/issues/1028
// - https://github.com/ant-design/ant-design-charts/issues/1022

const LazyLine = lazy(() =>
  import("@ant-design/plots").then((mod) => ({ default: mod.Line })),
);

export const Line = React.memo(({ ...props }: LineConfig) => (
  <Suspense fallback={null}>
    <LazyLine {...props} />
  </Suspense>
));

const LazyPie = lazy(() =>
  import("@ant-design/plots").then((mod) => ({ default: mod.Pie })),
);

export const Pie: ComponentType<PieConfig> = React.memo((props) => (
  <Suspense fallback={null}>
    <LazyPie {...props} />
  </Suspense>
));

const LazyBar = lazy(() =>
  import("@ant-design/plots").then((mod) => ({ default: mod.Bar })),
);
export const Bar: ComponentType<BarConfig> = React.memo((props) => (
  <Suspense fallback={null}>
    <LazyBar {...props} />
  </Suspense>
));

export type TreemapConfig = React.ComponentPropsWithoutRef<typeof TreemapImpl>;
const LazyTreemap = lazy(() =>
  import("@ant-design/plots").then((mod) => ({ default: mod.Treemap })),
);

export const Treemap: ComponentType<TreemapConfig> = React.memo((props) => (
  <Suspense fallback={null}>
    <LazyTreemap {...props} />
  </Suspense>
));

const LazyScatter = lazy(() =>
  import("@ant-design/plots").then((mod) => ({ default: mod.Scatter })),
);
export const Scatter: ComponentType<ScatterConfig> = React.memo((props) => (
  <Suspense fallback={null}>
    <LazyScatter {...props} />
  </Suspense>
));

export {
  VisualizationProvider,
  useVisualizationDispatch,
  useVisualization,
  useIsLoading,
} from "./visualization-context";

export * from "./LegendColor";
export * from "./PieTable";

export type { LineConfig, PieConfig, BarConfig, ScatterConfig };
