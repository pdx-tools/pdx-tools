import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Tooltip } from "@/components/Tooltip";
import type { PoliticalWorldRow } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { usePanelNav } from "../profiles/PanelNavContext";
import { useEu5Engine } from "../../store";
import { EntityLink } from "../profiles/EntityLink";
import { Eu5DataTable, Eu5MapDataTable } from "../../components";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";

const BACK_LABEL = "Great Powers";
const columnHelper = createColumnHelper<PoliticalWorldRow>();

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

function TippedHeader({ children, tooltip }: { children: React.ReactNode; tooltip: string }) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <span className="cursor-help decoration-dotted underline-offset-2 hover:underline">
          {children}
        </span>
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

  const topProfile =
    nav.top?.kind === "profile" || nav.top?.kind === "focus" ? nav.top.profile : null;
  const activeProfileIdx = topProfile?.kind === "country" ? topProfile.country_idx : null;

  const columns = useMemo(
    () => [
      columnHelper.accessor("ordinalRank", {
        id: "rank",
        header: "",
        enableSorting: false,
        meta: Eu5DataTable.meta({ variant: "num", width: 36 }),
        cell: ({ getValue }) => (
          <span className="font-game-num text-[10.5px] text-game-ink-700">
            #{formatInt(getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "country",
        header: "Country",
        enableSorting: false,
        cell: ({ row }) => (
          <EntityLink
            entity={{ kind: "country", ...row.original.country }}
            size="md"
            aligned
            backLabel={BACK_LABEL}
          />
        ),
      }),
      columnHelper.accessor("totalStateEfficacy", {
        id: "effDev",
        header: () => (
          <TippedHeader tooltip="Effective Development: sum of control × development across selected owned locations.">
            Eff. Dev
          </TippedHeader>
        ),
        enableSorting: false,
        meta: Eu5DataTable.meta({ variant: "num", width: 88 }),
        cell: ({ getValue }) => (
          <Eu5DataTable.NumericCell>{formatFloat(getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("activeStateCapacity", {
        id: "activeCap",
        header: () => (
          <TippedHeader tooltip="Active State Capacity: sum of population × control × development across selected owned locations. Displayed in millions.">
            Active Cap
          </TippedHeader>
        ),
        enableSorting: false,
        meta: Eu5DataTable.meta({ variant: "num", width: 88 }),
        cell: ({ getValue }) => (
          <Eu5DataTable.NumericCell>
            {formatFloat(getValue() / 1_000_000, 1)}
          </Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("totalPopulation", {
        id: "pop",
        header: () => (
          <TippedHeader tooltip="Total population across selected owned locations.">
            Pop
          </TippedHeader>
        ),
        enableSorting: false,
        meta: Eu5DataTable.meta({ variant: "num", width: 88 }),
        cell: ({ getValue }) => (
          <Eu5DataTable.NumericCell>{formatInt(getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("taxTradeIncome", {
        id: "income",
        header: () => (
          <TippedHeader tooltip="Estimated monthly tax plus trade income from the country.">
            Income
          </TippedHeader>
        ),
        enableSorting: false,
        meta: Eu5DataTable.meta({ variant: "num", width: 88 }),
        cell: ({ getValue }) => (
          <Eu5DataTable.NumericCell>{formatFloat(getValue(), 2)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.display({
        id: "remove",
        header: "",
        enableSorting: false,
        meta: Eu5DataTable.meta({ variant: "end", width: 28 }),
        cell: ({ row }) => (
          <Eu5DataTable.Affordance
            kind="remove"
            label={`Remove ${row.original.country.name} from selection`}
            onClick={() => void engine.trigger.removeCountry(row.original.country.countryIdx)}
          />
        ),
      }),
    ],
    [engine],
  );

  const rowSeparator = useMemo(
    () => (row: PoliticalWorldRow, idx: number) => {
      if (idx === 0) return null;
      const prevRow = rows[idx - 1];
      if (prevRow && prevRow.ordinalRank <= 10 && row.ordinalRank > 10) {
        return (
          <div className="flex items-center gap-3 px-3 py-0.5 font-game-num text-[10px] tracking-[.14em] text-game-ink-700 uppercase">
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
    <Eu5MapDataTable
      columns={columns}
      data={rows}
      tableOptions={{ enableSorting: false }}
      isRowInFilter={(row) => row.country.countryIdx === activeProfileIdx}
      rowSeparator={rowSeparator}
      getRowHoverTarget={(row) => ({ kind: "country", countryIdx: row.country.countryIdx })}
    />
  );
}
