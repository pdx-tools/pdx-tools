import type React from "react";
import { useCallback } from "react";
import { ResizablePanel } from "@/components/ResizablePanel";
import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import { useEu5MapMode, useEu5SelectionState, useSetEu5InsightPanelWidth } from "./store";
import { StateEfficacyInsight } from "./features/charts/StateEfficacy";
import { ControlInsight } from "./features/charts/Control";
import { DevelopmentInsight } from "./features/charts/DevelopmentInsight";
import { PossibleTaxInsight } from "./features/charts/PossibleTax";
import { TaxGapInsight } from "./features/charts/TaxGap";
import { MarketsInsight } from "./features/charts/Markets";
import { PopulationInsight } from "./features/charts/Population";
import { BuildingLevelsInsight } from "./features/charts/BuildingLevels";
import { ReligionInsight } from "./features/charts/ReligionInsight";
import { RgoInsight } from "./features/charts/Rgo";
import { PoliticalInsight } from "./features/charts/Political";
import { EntityProfileRoot } from "./EntityProfile";
import { PanelNavProvider, usePanelNav } from "./EntityProfile/PanelNavContext";
import { Breadcrumb } from "./EntityProfile/Breadcrumb";

type Eu5InsightPanelProps = {
  open: boolean;
  onClose: () => void;
};

export function Eu5InsightPanel({ open, onClose }: Eu5InsightPanelProps) {
  const setInsightPanelWidth = useSetEu5InsightPanelWidth();
  const handleWidthChange = useCallback(
    (width: number) => setInsightPanelWidth(width),
    [setInsightPanelWidth],
  );

  return (
    <ResizablePanel
      open={open}
      onClose={onClose}
      side="right"
      defaultWidth={640}
      collapseThreshold={256}
      maxWidth={1920}
      header={<span className="text-sm font-semibold text-slate-300">Insights</span>}
      onWidthChange={handleWidthChange}
    >
      <PanelContent />
    </ResizablePanel>
  );
}

function PanelContent() {
  return (
    <PanelNavProvider>
      <PanelContentInner />
    </PanelNavProvider>
  );
}

function PanelContentInner() {
  const nav = usePanelNav();
  const { top, stack } = nav;
  const selectionState = useEu5SelectionState();
  const currentMapMode = useEu5MapMode();
  const activeProfile = selectionState?.activeProfile;

  let content: React.ReactNode;

  if (top?.kind === "focus") {
    content = <EntityProfileRoot identity={top.profile} />;
  } else if (top?.kind === "profile") {
    content = <EntityProfileRoot identity={top.profile} />;
  } else if (activeProfile != null) {
    content = (
      <EntityProfileRoot key={profileIdentityKey(activeProfile)} identity={activeProfile} />
    );
  } else if (currentMapMode === "political") {
    content = <PoliticalInsight />;
  } else if (currentMapMode === "control") {
    content = <ControlInsight />;
  } else if (currentMapMode === "development") {
    content = <DevelopmentInsight />;
  } else if (currentMapMode === "stateEfficacy") {
    content = <StateEfficacyInsight />;
  } else if (currentMapMode === "possibleTax") {
    content = <PossibleTaxInsight />;
  } else if (currentMapMode === "taxGap") {
    content = <TaxGapInsight />;
  } else if (currentMapMode === "markets") {
    content = <MarketsInsight />;
  } else if (currentMapMode === "population") {
    content = <PopulationInsight />;
  } else if (currentMapMode === "buildingLevels") {
    content = <BuildingLevelsInsight />;
  } else if (currentMapMode === "religion") {
    content = <ReligionInsight />;
  } else if (currentMapMode === "rgoLevel") {
    content = <RgoInsight />;
  }

  if (content == null) {
    content = <EmptyInsightState />;
  }

  if (stack.length > 0) {
    return (
      <div className="flex h-full flex-col">
        <Breadcrumb />
        <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
      </div>
    );
  }

  return <>{content}</>;
}

function profileIdentityKey(profile: ActiveProfileIdentity) {
  if (profile.kind === "location") return `location:${profile.location_idx}`;
  return `${profile.kind}:${profile.anchor_location_idx}`;
}

function EmptyInsightState() {
  return (
    <div className="flex h-full items-center justify-center p-4 text-sm text-slate-500">
      No insight available for this view.
    </div>
  );
}
