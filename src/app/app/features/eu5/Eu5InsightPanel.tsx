import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { ResizablePanel } from "@/components/ResizablePanel";
import {
  useEu5Engine,
  useEu5MapMode,
  useEu5SelectionRevision,
  useEu5SelectionState,
  useSetEu5InsightPanelWidth,
} from "./store";
import { formatInt } from "@/lib/format";
import { StateEfficacyInsight } from "./features/charts/StateEfficacy";
import { DevelopmentInsight } from "./features/charts/DevelopmentInsight";
import { PossibleTaxInsight } from "./features/charts/PossibleTax";
import { TaxGapInsight } from "./features/charts/TaxGap";
import { MarketsInsight } from "./features/charts/Markets";
import type { StateEfficacyData, MapMode } from "@/wasm/wasm_eu5";
import { EntityProfileRoot } from "./EntityProfile";
import { MultiEntitySummaryPanel } from "./EntityProfile/MultiEntity/MultiEntitySummaryPanel";
import { AggregatePanel } from "./EntityProfile/Aggregate/AggregatePanel";
import { PanelNavProvider, usePanelNav } from "./EntityProfile/PanelNavContext";
import { Breadcrumb } from "./EntityProfile/Breadcrumb";
import { useEu5Trigger } from "./EntityProfile/useEu5Trigger";
import { LeafProfile } from "./EntityProfile/LeafProfile";
import { StatItem } from "./EntityProfile/components/StatItem";

const MULTI_ENTITY_MAX = 20;
const LOCATION_HEAVY_THRESHOLD = 100;

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
  const locationCount = selectionState?.locationCount ?? 0;
  const entityCount = selectionState?.entityCount ?? 0;
  const isEmpty = selectionState?.isEmpty ?? true;
  const focusedLocation = selectionState?.focusedLocation;
  const derivedEntityAnchor = selectionState?.derivedEntityAnchor;

  let content: React.ReactNode;

  if (top?.kind === "focus") {
    content = <NavFocusPanel locationIdx={top.locationIdx} />;
  } else if (top?.kind === "entity") {
    content = <EntityProfileRoot anchorIdx={top.anchorIdx} />;
  } else if (focusedLocation != null) {
    content = <EntityProfileRoot key={`focus-${focusedLocation}`} />;
  } else if (derivedEntityAnchor != null && !isEmpty) {
    content = <EntityProfileRoot key="compound" />;
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
  } else if (locationCount === 1) {
    content = <EntityProfileRoot key="leaf" />;
  } else if (!isEmpty) {
    const useAggregate = entityCount > MULTI_ENTITY_MAX || locationCount > LOCATION_HEAVY_THRESHOLD;
    if (!useAggregate && entityCount >= 2) {
      content = <MultiEntitySummaryPanel />;
    } else if (useAggregate) {
      content = <AggregatePanel />;
    }
  }

  if (content == null) {
    content = <SummaryPanelContent selectionState={selectionState ?? null} isEmpty={isEmpty} />;
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

function NavFocusPanel({ locationIdx }: { locationIdx: number }) {
  const { data, loading } = useEu5Trigger(
    (engine) => engine.trigger.getLocationProfile(locationIdx),
    [locationIdx],
  );
  if (loading && !data) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="h-16 animate-pulse rounded-lg bg-white/5" />
        <div className="h-8 animate-pulse rounded bg-white/5" />
        <div className="h-32 animate-pulse rounded bg-white/5" />
      </div>
    );
  }
  if (!data) return null;
  return <LeafProfile profile={data} />;
}

function SummaryPanelContent({
  selectionState,
  isEmpty,
}: {
  selectionState: SelectionState | null;
  isEmpty: boolean;
}) {
  const currentMapMode = useEu5MapMode();
  const engine = useEu5Engine();
  const selectionRevision = useEu5SelectionRevision();
  const [stateEfficacyData, setStateEfficacyData] = useState<StateEfficacyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void engine.trigger.getStateEfficacy().then((data) => {
      if (!cancelled) {
        setStateEfficacyData(data);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectionRevision, engine]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <SummaryHeader
        isEmpty={isEmpty}
        selectionState={selectionState}
        stateEfficacyData={stateEfficacyData}
        isLoading={isLoading}
      />
      <ModeContextualChart currentMapMode={currentMapMode} />
    </div>
  );
}

type SelectionState = NonNullable<ReturnType<typeof useEu5SelectionState>>;

function SummaryHeader({
  isEmpty,
  selectionState,
  stateEfficacyData,
  isLoading,
}: {
  isEmpty: boolean;
  selectionState: SelectionState | null;
  stateEfficacyData: StateEfficacyData | null;
  isLoading: boolean;
}) {
  // Show skeleton while initial data loads
  if (isLoading && !stateEfficacyData) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="h-8 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  // When a selection is active, use selection state values directly.
  // When no selection, compute world totals from state efficacy data
  // (which returns all nations when selection is empty).
  let entityCount: number;
  let entityLabel: string;
  let locationCount: number;
  let totalPopulation: number;

  if (!isEmpty && selectionState != null) {
    entityCount = selectionState.entityCount;
    entityLabel = "Entities";
    locationCount = selectionState.locationCount;
    totalPopulation = selectionState.totalPopulation;
  } else if (stateEfficacyData != null) {
    entityCount = stateEfficacyData.countries.length;
    entityLabel = "Nations";
    locationCount = stateEfficacyData.countries.reduce((s, c) => s + c.locationCount, 0);
    totalPopulation = stateEfficacyData.countries.reduce((s, c) => s + c.totalPopulation, 0);
  } else {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex gap-5">
        {/* Always show nation count when unfiltered; hide entity count for single-entity selections */}
        {(isEmpty || entityCount > 1) && (
          <StatItem label={entityLabel} value={formatInt(entityCount)} />
        )}
        <StatItem label="Locations" value={formatInt(locationCount)} />
        <StatItem label="Population" value={formatInt(totalPopulation)} />
      </div>
    </div>
  );
}

const MODE_NAMES: Partial<Record<MapMode, string>> = {
  political: "Political",
  control: "Control",
  development: "Development",
  population: "Population",
  markets: "Markets",
  rgoLevel: "RGO Level",
  buildingLevels: "Building Levels",
  possibleTax: "Possible Tax",
  taxGap: "Tax Gap",
  religion: "Religion",
  stateEfficacy: "State Efficacy",
};

function ModeContextualChart({ currentMapMode }: { currentMapMode: MapMode }) {
  const modeName = MODE_NAMES[currentMapMode] ?? currentMapMode;
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="text-sm font-semibold text-slate-400">{modeName} chart</p>
      <p className="text-xs text-slate-600">Coming soon</p>
    </div>
  );
}
