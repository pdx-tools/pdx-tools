import { useEffect, useState } from "react";
import { ResizablePanel } from "@/components/ResizablePanel";
import { useEu5Engine, useEu5MapMode, useEu5SelectionState } from "./store";
import { formatInt } from "@/lib/format";
import { StateEfficacy } from "./features/charts/StateEfficacy";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import type { StateEfficacyData, MapMode } from "@/wasm/wasm_eu5";

type Eu5InsightPanelProps = {
  open: boolean;
  onClose: () => void;
};

export function Eu5InsightPanel({ open, onClose }: Eu5InsightPanelProps) {
  return (
    <ResizablePanel
      open={open}
      onClose={onClose}
      side="right"
      defaultWidth={640}
      collapseThreshold={256}
      maxWidth={1920}
      header={<span className="text-sm font-semibold text-slate-300">Insights</span>}
    >
      <PanelContent />
    </ResizablePanel>
  );
}

function PanelContent() {
  const selectionState = useEu5SelectionState();
  const currentMapMode = useEu5MapMode();
  const engine = useEu5Engine();
  const [stateEfficacyData, setStateEfficacyData] = useState<StateEfficacyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // locationCount drives refetch: changes when selection changes.
  // Mode is intentionally NOT a dependency — calculate_state_efficacy is not
  // mode-dependent, so the data stays valid across mode switches.
  const locationCount = selectionState?.locationCount ?? 0;

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
  }, [locationCount, engine]);

  const isEmpty = selectionState?.isEmpty ?? true;
  const focusedLocation = selectionState?.focusedLocation;
  const focusedLocationName = selectionState?.focusedLocationName;
  const scopeDisplayName = selectionState?.scopeDisplayName ?? "entity";

  return (
    <div className="flex flex-col gap-4 p-4">
      {focusedLocation != null && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <button
            type="button"
            onClick={() => void engine.trigger.clearFocus()}
            className="mb-2 rounded px-2 py-1 text-xs text-sky-300 transition-colors hover:bg-white/10 hover:text-sky-200"
          >
            ← {scopeDisplayName}
          </button>
          <div className="text-sm font-semibold text-slate-100">
            {focusedLocationName ?? `Location ${focusedLocation}`}
          </div>
        </div>
      )}
      <SummaryHeader
        isEmpty={isEmpty}
        selectionState={selectionState ?? null}
        stateEfficacyData={stateEfficacyData}
        isLoading={isLoading}
      />
      <ModeContextualChart
        currentMapMode={currentMapMode}
        stateEfficacyData={stateEfficacyData}
        isLoading={isLoading}
      />
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

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </span>
      <span className="text-lg font-bold text-slate-100">{value}</span>
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
  religion: "Religion",
  stateEfficacy: "State Efficacy",
};

function ModeContextualChart({
  currentMapMode,
  stateEfficacyData,
  isLoading,
}: {
  currentMapMode: MapMode;
  stateEfficacyData: StateEfficacyData | null;
  isLoading: boolean;
}) {
  if (currentMapMode === "stateEfficacy") {
    // Show spinner only on initial load; stale data renders immediately while refreshing
    if (isLoading && stateEfficacyData == null) {
      return (
        <div className="flex items-center justify-center py-12">
          <LoadingIcon className="h-8 w-8 text-sky-400" />
        </div>
      );
    }
    if (stateEfficacyData != null) {
      return (
        <div className="pb-4">
          <p className="mb-3 text-[10px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
            State Efficacy · Control × Development
          </p>
          <StateEfficacy data={stateEfficacyData} minLocations={0} />
        </div>
      );
    }
    return null;
  }

  const modeName = MODE_NAMES[currentMapMode] ?? currentMapMode;
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="text-sm font-semibold text-slate-400">{modeName} chart</p>
      <p className="text-xs text-slate-600">Coming soon</p>
    </div>
  );
}
