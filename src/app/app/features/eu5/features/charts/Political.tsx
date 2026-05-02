import React from "react";
import { cx } from "class-variance-authority";
import { MinusIcon } from "@heroicons/react/20/solid";
import { Tooltip } from "@/components/Tooltip";
import type { PoliticalWorldRow } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import { countryProfileEntry, usePanelNav } from "../../EntityProfile/PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { useEu5Engine } from "../../store";
import { EntityLink } from "../../EntityProfile/EntityLink";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";

const BACK_LABEL = "Great Powers";

export function PoliticalInsight() {
  const query = useEu5SelectionTrigger((engine) => engine.trigger.getPoliticalWorldScoreboard());
  const rows = query.data?.rows ?? [];

  if (query.error) {
    return <Eu5InsightErrorState error={query.error} className="m-4" />;
  }

  if (query.loading && !query.data) {
    return <Eu5InsightLoadingState className="m-4" />;
  }

  if (rows.length === 0) {
    return <Eu5InsightEmptyState title="No great powers in this selection." className="m-4" />;
  }

  return <PoliticalWorldScoreboard rows={rows} />;
}

function PoliticalWorldScoreboard({ rows }: { rows: PoliticalWorldRow[] }) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();
  const engine = useEu5Engine();

  const topProfile =
    nav.top?.kind === "profile" || nav.top?.kind === "focus" ? nav.top.profile : null;
  const activeProfileIdx = topProfile?.kind === "country" ? topProfile.anchor_location_idx : null;

  const handleOpenProfile = (row: PoliticalWorldRow) => {
    nav.pushMany(
      [countryProfileEntry(row.country.anchorLocationIdx, row.country.name)],
      BACK_LABEL,
    );
    panToEntity(row.country.anchorLocationIdx);
  };

  const handleRemoveCountry = async (row: PoliticalWorldRow) => {
    await engine.trigger.removeCountry(row.country.anchorLocationIdx);
  };

  let hasRenderedSeparator = false;

  return (
    <div className="flex flex-col">
      <div
        className="grid h-[26px] items-center border-b border-game-line-strong px-3"
        style={{ gridTemplateColumns: "36px 1fr repeat(4, 88px) 28px" }}
      >
        <span />
        <span className="font-game-num text-[10px] tracking-[.14em] text-game-ink-700 uppercase">
          Country
        </span>
        <HeaderCell tooltip="Effective Development: sum of control × development across selected owned locations.">
          Eff. Dev
        </HeaderCell>
        <HeaderCell tooltip="Active State Capacity: sum of population × control × development across selected owned locations. Displayed in millions.">
          Active Cap
        </HeaderCell>
        <HeaderCell tooltip="Total population across selected owned locations.">Pop</HeaderCell>
        <HeaderCell tooltip="Estimated monthly tax plus trade income from the country.">
          Income
        </HeaderCell>
        <span />
      </div>

      {rows.map((row) => {
        const showSeparator = row.ordinalRank > 10 && !hasRenderedSeparator;
        if (showSeparator) hasRenderedSeparator = true;
        const isActive = row.country.anchorLocationIdx === activeProfileIdx;

        return (
          <React.Fragment key={`${row.country.tag}-${row.ordinalRank}`}>
            {showSeparator && (
              <div className="flex items-center gap-3 px-3 pt-1 pb-0.5 font-game-num text-[10px] tracking-[.14em] text-game-ink-700 uppercase">
                <span className="h-px flex-1 bg-game-line" />
                <span>Players outside top 10</span>
                <span className="h-px flex-1 bg-game-line" />
              </div>
            )}
            <EntityRow
              row={row}
              isActive={isActive}
              onOpenProfile={() => handleOpenProfile(row)}
              onRemoveCountry={() => void handleRemoveCountry(row)}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function EntityRow({
  row,
  isActive,
  onOpenProfile,
  onRemoveCountry,
}: {
  row: PoliticalWorldRow;
  isActive: boolean;
  onOpenProfile: () => void;
  onRemoveCountry: () => void;
}) {
  const handleActivate = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.altKey) {
      onRemoveCountry();
      return;
    }
    onOpenProfile();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpenProfile();
  };

  return (
    <div
      className={cx(
        "group relative grid h-7 cursor-pointer items-center border-b border-game-line px-3 outline-none focus-visible:ring-1 focus-visible:ring-game-accent-300",
        isActive
          ? "bg-game-panel-active shadow-[inset_2px_0_0_var(--color-game-accent-300)]"
          : "hover:bg-game-panel-hover",
      )}
      style={{ gridTemplateColumns: "36px 1fr repeat(4, 88px) 28px" }}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      aria-label={`Open profile for ${row.country.name}`}
    >
      <span className={cx("font-game-num text-[10.5px] text-game-ink-700")}>
        #{formatInt(row.ordinalRank)}
      </span>

      <EntityLink entity={{ kind: "country", ...row.country }} size="md" static />

      <MetricCell>{formatFloat(row.totalStateEfficacy, 1)}</MetricCell>
      <MetricCell>{formatFloat(row.activeStateCapacity / 1_000_000, 1)}</MetricCell>
      <MetricCell>{formatInt(row.totalPopulation)}</MetricCell>
      <MetricCell>{formatFloat(row.taxTradeIncome, 2)}</MetricCell>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemoveCountry();
        }}
        className={cx(
          "flex h-[18px] w-[18px] items-center justify-center rounded-control transition-[background,color,transform] duration-75",
          isActive
            ? "text-game-accent-100"
            : "text-game-ink-700 hover:bg-game-panel-active hover:text-game-accent-100",
        )}
        aria-label={`Remove ${row.country.name} from selection`}
      >
        <MinusIcon className="h-3.5 w-3.5" />
      </button>
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
