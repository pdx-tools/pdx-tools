import React from "react";
import { cx } from "class-variance-authority";
import { Tooltip } from "@/components/Tooltip";
import { formatFloat, formatInt } from "@/lib/format";
import type {
  CountryMetrics,
  DiplomacySection,
  DiplomacySubjectType,
  EntityRef,
  SubjectRef,
} from "@/wasm/wasm_eu5";
import { entityProfileEntry, usePanelNav } from "../PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { EntityLink } from "../EntityLink";

const PLURAL: Partial<Record<DiplomacySubjectType, string>> = {
  Tributary: "Tributaries",
  March: "Marches",
  "Hanseatic Member": "Hanseatic Members",
  "Maha Samanta": "Maha Samantas",
};

function pluralize(type: DiplomacySubjectType, count: number): string {
  const base = count > 1 ? (PLURAL[type] ?? `${type}s`) : type;
  return count > 1 ? `${base} (${count})` : base;
}

const GRID = "36px 1fr repeat(4, 88px)";

export function DiplomacyTabContent({ data }: { data: DiplomacySection }) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();

  const topProfile =
    nav.top?.kind === "profile" || nav.top?.kind === "focus" ? nav.top.profile : null;
  const activeProfileIdx = topProfile?.kind === "country" ? topProfile.anchor_location_idx : null;

  const handleOpen = (entity: EntityRef) => {
    nav.pushMany([entityProfileEntry(entity.kind, entity.anchorLocationIdx, entity.name)]);
    panToEntity(entity.anchorLocationIdx);
  };

  const grouped = new Map<DiplomacySubjectType, SubjectRef[]>();
  for (const s of data.subjects) {
    const group = grouped.get(s.subjectType) ?? [];
    group.push(s);
    grouped.set(s.subjectType, group);
  }

  const hasContent = !!data.overlord || data.subjects.length > 0;

  return (
    <div className="flex flex-col">
      {hasContent && (
        <div
          className="grid h-[26px] items-center border-b border-game-line-strong px-3"
          style={{ gridTemplateColumns: GRID }}
        >
          <span />
          <span className="font-game-num text-[10px] tracking-[.14em] text-game-ink-700 uppercase">
            Country
          </span>
          <HeaderCell tooltip="Effective Development: sum of control × development across owned locations.">
            Eff. Dev
          </HeaderCell>
          <HeaderCell tooltip="Active State Capacity: sum of population × control × development across owned locations. Displayed in millions.">
            Active Cap
          </HeaderCell>
          <HeaderCell tooltip="Total population across owned locations.">Pop</HeaderCell>
          <HeaderCell tooltip="Estimated monthly tax plus trade income.">Income</HeaderCell>
        </div>
      )}

      {data.overlord && data.overlordMetrics && (
        <GroupSection label="Overlord">
          <EntityMetricRow
            entityRef={data.overlord}
            metrics={data.overlordMetrics}
            label={data.overlordSubjectType ? `${data.overlordSubjectType} of` : undefined}
            isActive={data.overlord.anchorLocationIdx === activeProfileIdx}
            onOpen={() => handleOpen(data.overlord!)}
          />
        </GroupSection>
      )}

      {[...grouped.entries()].map(([type, subjects]) => (
        <GroupSection key={type} label={pluralize(type, subjects.length)}>
          {subjects.map((s) => (
            <EntityMetricRow
              key={`${s.entity.anchorLocationIdx}`}
              entityRef={s.entity}
              metrics={s.metrics}
              isActive={s.entity.anchorLocationIdx === activeProfileIdx}
              onOpen={() => handleOpen(s.entity)}
            />
          ))}
        </GroupSection>
      ))}

      {!hasContent && (
        <p className="px-3 py-2 text-sm text-game-ink-500">No diplomatic relations.</p>
      )}
    </div>
  );
}

function GroupSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function EntityMetricRow({
  entityRef,
  metrics,
  label,
  isActive,
  onOpen,
}: {
  entityRef: EntityRef;
  metrics: CountryMetrics;
  label?: string;
  isActive: boolean;
  onOpen: () => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };

  return (
    <div
      className={cx(
        "grid h-7 cursor-pointer items-center border-b border-game-line px-3 outline-none focus-visible:ring-1 focus-visible:ring-game-accent-300",
        isActive
          ? "bg-game-panel-active shadow-[inset_2px_0_0_var(--color-game-accent-300)]"
          : "hover:bg-game-panel-hover",
      )}
      style={{ gridTemplateColumns: GRID }}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      aria-label={`Open profile for ${entityRef.name}`}
    >
      <span className="font-game-num text-[10.5px] text-game-ink-700">
        {metrics.greatPowerRank > 0 ? `#${metrics.greatPowerRank}` : ""}
      </span>

      <div className="flex min-w-0 items-center gap-1">
        {label && <span className="shrink-0 text-[11px] text-game-ink-500">{label}</span>}
        <EntityLink entity={entityRef} size="md" static />
      </div>

      <MetricCell>{formatFloat(metrics.totalStateEfficacy, 1)}</MetricCell>
      <MetricCell>{formatFloat(metrics.activeStateCapacity / 1_000_000, 1)}</MetricCell>
      <MetricCell>{formatInt(metrics.totalPopulation)}</MetricCell>
      <MetricCell>{formatFloat(metrics.taxTradeIncome, 2)}</MetricCell>
    </div>
  );
}

function MetricCell({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate text-right font-game-num text-xs text-game-ink-100 tabular-nums">
      {children}
    </span>
  );
}

function HeaderCell({ children, tooltip }: { children: React.ReactNode; tooltip: string }) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <span className="cursor-help text-right font-game-num text-[10px] tracking-[.14em] text-game-ink-700 uppercase decoration-dotted underline-offset-2 hover:text-game-ink-500 hover:underline">
          {children}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="max-w-72 text-xs normal-case">
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
