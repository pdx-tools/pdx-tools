import { formatInt } from "@/lib/format";
import type { ReactNode } from "react";
import { StatItem } from "../EntityProfile/components/StatItem";
import { usePanelNav } from "../EntityProfile/PanelNavContext";
import { useEu5SelectionTrigger } from "../EntityProfile/useEu5Trigger";

interface Stat {
  label: string;
  value: string;
}

type InsightScopeHeaderProps =
  | {
      children: ReactNode;
      stats?: never;
    }
  | {
      children?: never;
      stats: Stat[];
    };

export function InsightScopeHeaderSkeleton() {
  return <div className="mb-0 h-[52px] animate-pulse rounded-xl bg-white/5" />;
}

export function InsightScopeHeader({ children, stats }: InsightScopeHeaderProps) {
  const nav = usePanelNav();
  if (nav.stack.length > 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex gap-5">
        {children ?? stats?.map((s) => <StatItem key={s.label} label={s.label} value={s.value} />)}
      </div>
    </div>
  );
}

export function ScopeSummaryHeader() {
  const { data, loading } = useEu5SelectionTrigger((engine) => engine.trigger.getScopeSummary());

  if (loading && !data) {
    return <InsightScopeHeaderSkeleton />;
  }

  if (!data) return null;

  return (
    <InsightScopeHeader>
      {(data.isEmpty || data.entityCount > 1) && (
        <StatItem
          label={data.isEmpty ? "Nations" : "Entities"}
          value={formatInt(data.entityCount)}
        />
      )}
      <StatItem label="Locations" value={formatInt(data.locationCount)} />
      <StatItem label="Population" value={formatInt(data.totalPopulation)} />
    </InsightScopeHeader>
  );
}
