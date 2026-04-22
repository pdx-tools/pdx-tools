import { formatInt } from "@/lib/format";
import { StatItem } from "../EntityProfile/components/StatItem";
import { usePanelNav } from "../EntityProfile/PanelNavContext";
import { useEu5Trigger } from "../EntityProfile/useEu5Trigger";

interface Stat {
  label: string;
  value: string;
}

interface InsightScopeHeaderProps {
  stats: Stat[];
}

export function InsightScopeHeaderSkeleton() {
  return <div className="mb-0 h-[52px] animate-pulse rounded-xl bg-white/5" />;
}

export function InsightScopeHeader({ stats }: InsightScopeHeaderProps) {
  const nav = usePanelNav();
  if (nav.stack.length > 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex gap-5">
        {stats.map((s) => (
          <StatItem key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
    </div>
  );
}

export function ScopeSummaryHeader({ selectionKey }: { selectionKey: string }) {
  const { data, loading } = useEu5Trigger(
    (engine) => engine.trigger.getScopeSummary(),
    [selectionKey],
  );

  if (loading && !data) {
    return <InsightScopeHeaderSkeleton />;
  }

  if (!data) return null;

  const entityLabel = data.isEmpty ? "Nations" : "Entities";
  const stats = [
    ...(data.isEmpty || data.entityCount > 1
      ? [{ label: entityLabel, value: formatInt(data.entityCount) }]
      : []),
    { label: "Locations", value: formatInt(data.locationCount) },
    { label: "Population", value: formatInt(data.totalPopulation) },
  ];

  return <InsightScopeHeader stats={stats} />;
}
