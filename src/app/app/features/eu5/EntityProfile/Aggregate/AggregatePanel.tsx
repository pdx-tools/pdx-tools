import type React from "react";
import { useEu5MapMode, useEu5SelectionState } from "../../store";
import { useEu5SelectionTrigger } from "../useEu5Trigger";
import { EntityList } from "../MultiEntity/EntityList";
import { LocationDistributionChart } from "../MultiEntity/LocationDistributionChart";
import { formatFloat } from "@/lib/format";
import type { RankedLocation } from "@/wasm/wasm_eu5";
import { usePanelNav } from "../PanelNavContext";
import { ScopeSummaryHeader } from "../../features/InsightScopeHeader";

const TOP_ENTITIES_SHOWN = 10;

export function AggregatePanel() {
  const selectionState = useEu5SelectionState();
  const mapMode = useEu5MapMode();
  const locationCount = selectionState?.locationCount ?? 0;
  const nav = usePanelNav();

  const breakdownQuery = useEu5SelectionTrigger(
    (engine) => engine.trigger.getEntityBreakdown(),
    [mapMode],
  );

  const distributionQuery = useEu5SelectionTrigger(
    (engine) => engine.trigger.getLocationDistribution(),
    [mapMode],
  );

  const allRows = breakdownQuery.data?.rows ?? [];
  const topRows = allRows.slice(0, TOP_ENTITIES_SHOWN);
  const tierLabel = `${locationCount} locations`;

  function onDrillIn(anchorIdx: number, label: string) {
    nav.pushMany([{ kind: "entity", anchorIdx, label }], tierLabel);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <ScopeSummaryHeader />
      {distributionQuery.data && (
        <section>
          <LocationDistributionChart distribution={distributionQuery.data} />
        </section>
      )}

      {distributionQuery.data && distributionQuery.data.topLocations.length > 0 && (
        <section>
          <SectionTitle>Top locations · {distributionQuery.data.metricLabel}</SectionTitle>
          <TopLocationsList locations={distributionQuery.data.topLocations} />
        </section>
      )}

      {breakdownQuery.loading && !breakdownQuery.data ? (
        <div className="h-24 animate-pulse rounded bg-white/5" />
      ) : topRows.length > 0 ? (
        <section>
          <SectionTitle>
            Top entities · {allRows[0]?.modeMetricLabel ?? "Value"}
            {allRows.length > TOP_ENTITIES_SHOWN &&
              ` (showing ${TOP_ENTITIES_SHOWN} of ${allRows.length})`}
          </SectionTitle>
          <EntityList rows={topRows} onDrillIn={onDrillIn} />
        </section>
      ) : null}
    </div>
  );
}

function TopLocationsList({ locations }: { locations: RankedLocation[] }) {
  return (
    <ol className="flex flex-col gap-1">
      {locations.map((loc, i) => (
        <li key={loc.locationIdx} className="flex items-center gap-2 text-sm">
          <span className="w-4 shrink-0 text-right font-mono text-xs text-slate-500">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-slate-300">{loc.name}</span>
          <span className="font-mono text-xs text-slate-400">{formatFloat(loc.value, 1)}</span>
        </li>
      ))}
    </ol>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
      {children}
    </p>
  );
}
