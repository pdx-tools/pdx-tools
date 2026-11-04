import type { ReactNode } from "react";
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
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {children ?? stats?.map((s) => <StatItem key={s.label} label={s.label} value={s.value} />)}
    </div>
  );
}
