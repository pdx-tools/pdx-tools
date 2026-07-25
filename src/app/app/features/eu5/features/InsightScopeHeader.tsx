import type { ReactNode } from "react";
import { usePanelNav } from "./profiles/PanelNavContext";
import { Skeleton, StatItem } from "../components";

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
  return <Skeleton className="mb-0 h-[52px]" />;
}

export function InsightScopeHeader({ children, stats }: InsightScopeHeaderProps) {
  const nav = usePanelNav();
  if (nav.stack.length > 0) return null;

  return (
    <div className="rounded-panel border border-game-line-strong bg-game-panel-hover px-4 py-3">
      <div className="flex gap-5">
        {children ?? stats?.map((s) => <StatItem key={s.label} label={s.label} value={s.value} />)}
      </div>
    </div>
  );
}
