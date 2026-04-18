import type React from "react";
import { useEu5MapMode, useEu5SelectionState } from "../../store";
import { useEu5Trigger } from "../useEu5Trigger";
import { EntityList } from "./EntityList";
import { EntityComparisonChart } from "./EntityComparisonChart";
import { LocationDistributionChart } from "./LocationDistributionChart";
import { formatInt, formatFloat } from "@/lib/format";
import { usePanelNav } from "../PanelNavContext";
import { getSelectionIdentityKey } from "../selectionIdentity";
import { StatItem } from "../components/StatItem";

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
      <AggregateSummaryBar rows={rows} selectionState={selectionState} />

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

type SelectionState = NonNullable<ReturnType<typeof useEu5SelectionState>>;

function AggregateSummaryBar({
  rows,
  selectionState,
}: {
  rows: { totalDevelopment: number; locationCount: number }[];
  selectionState: SelectionState | null;
}) {
  const entityCount = selectionState?.entityCount ?? rows.length;
  const locationCount = selectionState?.locationCount ?? 0;
  const totalPopulation = selectionState?.totalPopulation ?? 0;
  const avgDev =
    rows.length > 0
      ? rows.reduce((s, r) => s + r.totalDevelopment, 0) /
        rows.reduce((s, r) => s + r.locationCount, 0)
      : 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex flex-wrap gap-5">
        <StatItem label="Entities" value={formatInt(entityCount)} />
        <StatItem label="Locations" value={formatInt(locationCount)} />
        <StatItem label="Population" value={formatInt(totalPopulation)} />
        {rows.length > 0 && <StatItem label="Avg Dev" value={formatFloat(avgDev, 1)} />}
      </div>
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
