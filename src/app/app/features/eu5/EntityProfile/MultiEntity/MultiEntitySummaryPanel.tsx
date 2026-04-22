import type React from "react";
import { useEu5MapMode, useEu5SelectionState } from "../../store";
import { useEu5Trigger } from "../useEu5Trigger";
import { EntityList } from "./EntityList";
import { EntityComparisonChart } from "./EntityComparisonChart";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { usePanelNav } from "../PanelNavContext";
import { getSelectionIdentityKey } from "../selectionIdentity";
import { ScopeSummaryHeader } from "../../features/InsightScopeHeader";

export function MultiEntitySummaryPanel() {
  const selectionState = useEu5SelectionState();
  const mapMode = useEu5MapMode();
  const selectionKey = getSelectionIdentityKey(selectionState);
  const nav = usePanelNav();

  const breakdownQuery = useEu5Trigger(
    (engine) => engine.trigger.getEntityBreakdown(),
    [selectionKey, mapMode],
  );

  const distributionQuery = useEu5Trigger(
    (engine) => engine.trigger.getLocationDistribution(),
    [selectionKey, mapMode],
  );

  const rows = breakdownQuery.data?.rows ?? [];
  const entityKindLabel = mapMode === "markets" ? "markets" : "countries";
  const tierLabel = `${rows.length} ${entityKindLabel}`;

  function onDrillIn(anchorIdx: number, label: string) {
    nav.pushMany([{ kind: "entity", anchorIdx, label }], tierLabel);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <ScopeSummaryHeader selectionKey={selectionKey} />
      {breakdownQuery.loading && !breakdownQuery.data ? (
        <div className="h-24 animate-pulse rounded bg-white/5" />
      ) : rows.length > 0 ? (
        <>
          <section>
            <SectionTitle>Entities</SectionTitle>
            <EntityList rows={rows} onDrillIn={onDrillIn} />
          </section>
          <section>
            <SectionTitle>Comparison · {rows[0]?.modeMetricLabel ?? "Value"}</SectionTitle>
            <EntityComparisonChart rows={rows} />
          </section>
        </>
      ) : null}

      {distributionQuery.data && (
        <section>
          <LocationDistributionChart distribution={distributionQuery.data} />
        </section>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
      {children}
    </p>
  );
}
