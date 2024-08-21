import React, { useState } from "react";
import {
  SideBarButton,
  SideBarButtonProps,
} from "../../components/SideBarButton";
import { VisualizationProvider } from "@/components/viz";
import {
  SideBarContainerProvider,
  useSideBarContainerRef,
} from "../../components/SideBarContainer";
import { Sheet } from "@/components/Sheet";
import { VizModules } from "../../types/visualizations";
import { cx } from "class-variance-authority";
import { VizRenderer } from "./VizRenderer";
import { ChartDrawerTitle } from "./ChartDrawerTitle";

export const ChartSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  return (
    <Sheet modal={false}>
      <Sheet.Trigger asChild>
        <SideBarButton {...props}>{children}</SideBarButton>
      </Sheet.Trigger>

      <VisualizationProvider>
        <SideBarContainerProvider>
          <ChartContent />
        </SideBarContainerProvider>
      </VisualizationProvider>
    </Sheet>
  );
};

const DEFAULT_VIZUALIZATION_SELECTION = "monthly-income";

export const ChartContent = () => {
  const [selectedViz, setSelectedViz] = useState<VizModules>(
    DEFAULT_VIZUALIZATION_SELECTION,
  );
  const [expanded, setExpanded] = useState(false);
  const sideBarContainerRef = useSideBarContainerRef();

  return (
    <Sheet.Content
      ref={sideBarContainerRef}
      side="right"
      onInteractOutside={(e) => e.preventDefault()}
      className={cx(
        "flex flex-col bg-white pt-4 transition-[width] duration-200 dark:bg-slate-900",
        expanded ? "w-full" : "w-[800px] max-w-full",
      )}
    >
      <Sheet.Header className="z-10 items-center px-4 pb-4 shadow-md">
        <ChartDrawerTitle
          selectedViz={selectedViz}
          setSelectedViz={setSelectedViz}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      </Sheet.Header>
      <Sheet.Body className="flex flex-1 flex-col px-4 pt-6">
        <div className="flex-1 basis-0">
          <VizRenderer module={selectedViz} />
        </div>
      </Sheet.Body>
    </Sheet.Content>
  );
};
