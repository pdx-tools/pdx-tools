import React, { lazy, Suspense } from "react";
import type { ComponentType } from "react";

const LazyEChart = lazy(() =>
  import("./EChart").then((mod) => ({ default: mod.EChart })),
);

export const EChart: ComponentType<
  React.ComponentPropsWithoutRef<typeof LazyEChart>
> = React.memo((props) => (
  <Suspense fallback={null}>
    <LazyEChart {...props} />
  </Suspense>
));
export type { EChartsOption } from "./EChart";

const LazyPieTable = lazy(() =>
  import("./PieTable").then((mod) => ({ default: mod.PieTable })),
);

export const PieTable: ComponentType<
  React.ComponentPropsWithoutRef<typeof LazyPieTable>
> = React.memo((props) => (
  <Suspense fallback={null}>
    <LazyPieTable {...props} />
  </Suspense>
));

export {
  VisualizationProvider,
  useVisualizationDispatch,
  useVisualization,
  useIsLoading,
} from "./visualization-context";

export * from "./LegendColor";
export type { DataPoint } from "./PieTable";
