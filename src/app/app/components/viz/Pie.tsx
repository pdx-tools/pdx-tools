import React, { lazy, Suspense } from "react";
import type { ComponentType } from "react";
import type { PieConfig } from "@ant-design/plots";

const LazyPie = lazy(() =>
  import("@ant-design/plots").then((mod) => ({ default: mod.Pie })),
);

export const Pie: ComponentType<PieConfig> = React.memo((props) => (
  <Suspense fallback={null}>
    <LazyPie {...props} />
  </Suspense>
));

export type { PieConfig };
