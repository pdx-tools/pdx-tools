import { useMemo } from "react";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Tooltip } from "@/components/Tooltip";
import type { PoliticalWorldRow } from "@/wasm/wasm_eu5";
import { formatInt, formatFixed } from "@/lib/format";
import { glossaryTerm } from "../../components/EntityName";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { usePanelNav } from "../profiles/PanelNavContext";
import { useEu5Engine, useEu5SelectionState } from "../../store";
import { CountryLink } from "../profiles/EntityLink";
import { Eu5DataTable, Eu5MapDataTable } from "../../components";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";

const columnHelper = createColumnHelper<PoliticalWorldRow>();

const removeColumn = (engine: ReturnType<typeof useEu5Engine>) =>
  columnHelper.display({
    id: "remove",
    header: "",
    enableSorting: false,
    meta: Eu5DataTable.meta({ variant: "end", width: 28 }),
    cell: ({ row }) => (
      <Eu5DataTable.Affordance
        kind="remove"
        label={`Remove ${row.original.country.country.name} from selection`}
        onClick={() => void engine.commands.removeCountry(row.original.country.country.key)}
      />
    ),
  });

export function PoliticalInsight() {
  const query = useEu5SelectionTrigger((engine) => engine.queries.getPoliticalWorldScoreboard());
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

function TippedHeader({ children, tooltip }: { children: React.ReactNode; tooltip: string }) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <span className={glossaryTerm}>{children}</span>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="max-w-72 text-xs normal-case">
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}

function PoliticalWorldScoreboard({ rows }: { rows: PoliticalWorldRow[] }) {
  const nav = usePanelNav();
  const engine = useEu5Engine();
  // Only a selection has countries to remove.
  const selection = useEu5SelectionState();
  const removable = selection != null && !selection.isEmpty;

  const topProfile =
    nav.top?.kind === "profile" || nav.top?.kind === "focus" ? nav.top.profile : null;
  const activeProfileIdx = topProfile?.kind === "country" ? topProfile.country.key : null;

  const columns = useMemo(
    () => [
      columnHelper.accessor("ordinalRank", {
        id: "rank",
        header: "",
        enableSorting: false,
        meta: Eu5DataTable.meta({ variant: "num", width: 36 }),
        cell: ({ getValue }) => (
          <span className="font-game-num text-[12px] text-game-ink-500">
            #{formatInt(getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "country",
        header: "Country",
        enableSorting: false,
        cell: ({ row }) => <CountryLink country={row.original.country} size="md" aligned />,
      }),
      columnHelper.accessor("greatPowerPoints", {
        id: "gpScore",
        header: () => (
          <TippedHeader tooltip="Great power score: the points that set the game's great power rank.">
            GP Score
          </TippedHeader>
        ),
        meta: Eu5DataTable.meta({
          variant: "num",
          width: 96,
          headerLabel: "GP Score",
        }),
        cell: ({ getValue }) => (
          <Eu5DataTable.NumericCell>{formatFixed(getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("totalStateEfficacy", {
        id: "effDev",
        header: () => (
          <TippedHeader tooltip="Effective Development: sum of control × development across selected owned locations.">
            Eff. Dev
          </TippedHeader>
        ),
        meta: Eu5DataTable.meta({
          variant: "num",
          width: 96,
          headerLabel: "Eff. Dev",
        }),
        cell: ({ getValue }) => (
          <Eu5DataTable.NumericCell>{formatFixed(getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("activeStateCapacity", {
        id: "activeCap",
        header: () => (
          <TippedHeader tooltip="Active State Capacity: sum of population × control × development across selected owned locations. Displayed in millions.">
            Active Cap
          </TippedHeader>
        ),
        meta: Eu5DataTable.meta({
          variant: "num",
          width: 108,
          headerLabel: "Active State Capacity",
        }),
        cell: ({ getValue }) => (
          <Eu5DataTable.NumericCell>{formatFixed(getValue(), 0)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("totalPopulation", {
        id: "pop",
        header: () => (
          <TippedHeader tooltip="Total population across selected owned locations.">
            Pop
          </TippedHeader>
        ),
        meta: Eu5DataTable.meta({
          variant: "num",
          width: 92,
          headerLabel: "Pop",
        }),
        cell: ({ getValue }) => (
          <Eu5DataTable.NumericCell>{formatFixed(getValue(), 0)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("income", {
        id: "income",
        header: () => (
          <TippedHeader tooltip="Monthly income, as the country overview shows it.">
            Income
          </TippedHeader>
        ),
        meta: Eu5DataTable.meta({
          variant: "num",
          width: 80,
          headerLabel: "Income",
        }),
        cell: ({ getValue }) => (
          <Eu5DataTable.NumericCell>{formatFixed(getValue(), 0)}</Eu5DataTable.NumericCell>
        ),
      }),
      ...(removable ? [removeColumn(engine)] : []),
    ],
    [engine, removable],
  );

  const rowSeparator = useMemo(
    () => (row: PoliticalWorldRow, idx: number, ctx: { sorted: boolean }) => {
      if (ctx.sorted) return null;
      if (idx === 0) return null;
      const prevRow = rows[idx - 1];
      if (prevRow && prevRow.ordinalRank <= 10 && row.ordinalRank > 10) {
        return (
          <div className="flex items-center gap-3 px-3 py-0.5 font-game-num text-[length:var(--game-label-size)] tracking-[0.04em] text-game-ink-500 uppercase">
            <span className="h-px flex-1 bg-game-line" />
            <span>Players outside top 10</span>
            <span className="h-px flex-1 bg-game-line" />
          </div>
        );
      }
      return null;
    },
    [rows],
  );

  return (
    <div className="flex flex-col gap-4 p-3.5">
      <Eu5MapDataTable
        columns={columns}
        data={rows}
        isRowInFilter={(row) => row.country.country.key === activeProfileIdx}
        rowSeparator={rowSeparator}
        getRowHoverTarget={(row) => ({ kind: "country", countryIdx: row.country.country.key })}
      />
    </div>
  );
}
