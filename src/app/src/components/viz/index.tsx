import dynamic from "next/dynamic";
import React, { ComponentType } from "react";
import type {
  LineConfig,
  HeatmapConfig,
  PieConfig,
  BarConfig,
} from "@ant-design/charts";
import { VisualizationLoader } from "./VisualizationLoader";

export const Line: ComponentType<LineConfig> = React.memo(
  dynamic(() => import("@ant-design/charts").then((mod) => mod.Line), {
    ssr: false,
    loading: () => <VisualizationLoader />,
  })
);

export const Heatmap: ComponentType<HeatmapConfig> = React.memo(
  dynamic(() => import("@ant-design/charts").then((mod) => mod.Heatmap), {
    ssr: false,
    loading: () => <VisualizationLoader />,
  })
);

export const Pie: ComponentType<PieConfig> = React.memo(
  dynamic(() => import("@ant-design/charts").then((mod) => mod.Pie), {
    ssr: false,
    loading: () => <VisualizationLoader />,
  })
);

export const Bar: ComponentType<BarConfig> = React.memo(
  dynamic(() => import("@ant-design/charts").then((mod) => mod.Bar), {
    ssr: false,
    loading: () => <VisualizationLoader />,
  })
);

export {
  VisualizationProvider,
  useVisualizationDispatch,
  useIsLoading,
} from "./visualization-context";

export * from "./LegendColor";
export * from "./PieTable";

export type { LineConfig, HeatmapConfig, PieConfig, BarConfig };
