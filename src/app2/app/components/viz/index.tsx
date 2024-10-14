import dynamic from "next/dynamic";
import React, { ComponentType } from "react";
import type {
  LineConfig as LineConfigImpl,
  PieConfig,
  BarConfig,
  Treemap as TreemapImpl,
  ScatterConfig,
} from "@ant-design/plots";
import { VisualizationLoader } from "./VisualizationLoader";

type LineConfig = LineConfigImpl & {
  tooltip: {
    shared: boolean;
  };
};

// The imports from @ant-design/plots are to fix next.js css-npm error
// - https://github.com/ant-design/ant-design-charts/issues/1275
// - https://github.com/ant-design/ant-design-charts/issues/1028
// - https://github.com/ant-design/ant-design-charts/issues/1022

export const LineImpl: ComponentType<LineConfigImpl> = React.memo(
  dynamic(() => import("@ant-design/plots").then((mod) => mod.Line), {
    ssr: false,
    loading: () => <VisualizationLoader />,
  }),
);

export const Line = ({ ...props }: LineConfig) => {
  return <LineImpl {...props} />;
};

export const Pie: ComponentType<PieConfig> = React.memo(
  dynamic(() => import("@ant-design/plots").then((mod) => mod.Pie), {
    ssr: false,
    loading: () => <VisualizationLoader />,
  }),
);

export const Bar: ComponentType<BarConfig> = React.memo(
  dynamic(() => import("@ant-design/plots").then((mod) => mod.Bar), {
    ssr: false,
    loading: () => <VisualizationLoader />,
  }),
);

export type TreemapConfig = React.ComponentPropsWithoutRef<typeof TreemapImpl>;
export const Treemap: ComponentType<TreemapConfig> = React.memo(
  dynamic(() => import("@ant-design/plots").then((mod) => mod.Treemap), {
    ssr: false,
    loading: () => <VisualizationLoader />,
  }),
);

export const Scatter: ComponentType<ScatterConfig> = React.memo(
  dynamic(() => import("@ant-design/plots").then((mod) => mod.Scatter), {
    ssr: false,
    loading: () => <VisualizationLoader />,
  }),
);

export {
  VisualizationProvider,
  useVisualizationDispatch,
  useVisualization,
  useIsLoading,
} from "./visualization-context";

export * from "./LegendColor";
export * from "./PieTable";

export type { LineConfig, PieConfig, BarConfig, ScatterConfig };
