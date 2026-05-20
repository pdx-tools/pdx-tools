import { useMemo } from "react";
import { cx } from "class-variance-authority";
import { createColumnHelper } from "@tanstack/react-table";
import { formatFloat, formatInt } from "@/lib/format";
import type {
  CountryMetrics,
  CountryRef,
  DiplomacySection,
  DiplomacySubjectType,
  SubjectRef,
} from "@/wasm/wasm_eu5";
import { entityProfileEntry, usePanelNav } from "../PanelNavContext";
import { usePanToEntity } from "../../../usePanToEntity";
import { CountryLink } from "../EntityLink";
import { Eu5DataTable, Eu5MapDataTable } from "../../../components";
import type { Eu5MapHoverTarget } from "../../../useEu5MapHoverTarget";
import type { Row } from "@tanstack/react-table";

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

type DiplomacyRow = {
  id: string;
  entity: CountryRef;
  metrics: CountryMetrics;
  libertyDesire?: number;
  subjectLabel?: string;
  group: string;
  isActive: boolean;
};

const columnHelper = createColumnHelper<DiplomacyRow>();

function NameCell({ row }: { row: Row<DiplomacyRow> }) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();
  const { entity, subjectLabel, isActive } = row.original;

  const handleOpen = () => {
    nav.pushMany([entityProfileEntry("country", entity.country.key, entity.country.name)]);
    panToEntity(entity.anchorLocationIdx);
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      className={cx(
        "flex w-full min-w-0 items-center gap-1 text-left",
        isActive ? "cursor-default" : "cursor-pointer",
      )}
    >
      {subjectLabel && (
        <span className="shrink-0 text-[11px] text-game-ink-500">{subjectLabel}</span>
      )}
      <CountryLink country={entity} aligned static />
    </button>
  );
}

function LibertyCell({ row }: { row: Row<DiplomacyRow> }) {
  const { libertyDesire } = row.original;
  if (libertyDesire == null) return null;
  return (
    <span
      className={cx("font-game-num tabular-nums", libertyDesire > 50 ? "text-game-err" : undefined)}
    >
      {formatFloat(libertyDesire, 1)}%
    </span>
  );
}

const columns = [
  columnHelper.accessor((row) => row.metrics.greatPowerRank, {
    id: "gpRank",
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "GP", variant: "num", width: 36 }),
    cell: (info) => {
      const rank = info.getValue();
      return rank > 0 ? (
        <Eu5DataTable.NumericCell className="text-[10.5px] text-game-ink-700">
          #{rank}
        </Eu5DataTable.NumericCell>
      ) : null;
    },
  }),
  columnHelper.accessor((row) => row.entity.country.name, {
    id: "name",
    sortingFn: "text",
    meta: Eu5DataTable.meta({ headerLabel: "Country", variant: "pin" }),
    cell: ({ row }) => <NameCell row={row} />,
  }),
  columnHelper.accessor((row) => row.metrics.totalStateEfficacy, {
    id: "effDev",
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Eff. Dev", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 1)}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor((row) => row.metrics.activeStateCapacity / 1_000_000, {
    id: "activeCap",
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Active Cap", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 1)}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor((row) => row.metrics.totalPopulation, {
    id: "pop",
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Pop", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatInt(info.getValue())}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor((row) => row.metrics.taxTradeIncome, {
    id: "income",
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Income", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor((row) => row.libertyDesire ?? -1, {
    id: "liberty",
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Liberty", variant: "num" }),
    cell: ({ row }) => <LibertyCell row={row} />,
  }),
];

function getRowHoverTarget(row: DiplomacyRow): Eu5MapHoverTarget {
  return { kind: "country", countryIdx: row.entity.country.key };
}

export function DiplomacyTabContent({ data }: { data: DiplomacySection }) {
  const nav = usePanelNav();
  const topProfile =
    nav.top?.kind === "profile" || nav.top?.kind === "focus" ? nav.top.profile : null;
  const activeProfileIdx = topProfile?.kind === "country" ? topProfile.country.key : null;

  const rows = useMemo<DiplomacyRow[]>(() => {
    const result: DiplomacyRow[] = [];

    if (data.overlord && data.overlordMetrics) {
      result.push({
        id: `overlord-${data.overlord.country.key}`,
        entity: data.overlord,
        metrics: data.overlordMetrics,
        subjectLabel: data.overlordSubjectType ? `${data.overlordSubjectType} of` : undefined,
        group: "Overlord",
        isActive: data.overlord.country.key === activeProfileIdx,
      });
    }

    const grouped = new Map<DiplomacySubjectType, SubjectRef[]>();
    for (const s of data.subjects) {
      const group = grouped.get(s.subjectType) ?? [];
      group.push(s);
      grouped.set(s.subjectType, group);
    }

    for (const [type, subjects] of grouped.entries()) {
      const groupLabel = pluralize(type, subjects.length);
      for (const s of subjects) {
        result.push({
          id: `subject-${s.entity.country.key}`,
          entity: s.entity,
          metrics: s.metrics,
          libertyDesire: s.libertyDesire,
          group: groupLabel,
          isActive: s.entity.country.key === activeProfileIdx,
        });
      }
    }

    return result;
  }, [data, activeProfileIdx]);

  if (rows.length === 0) {
    return <p className="px-3 py-2 text-sm text-game-ink-500">No diplomatic relations.</p>;
  }

  return (
    <Eu5MapDataTable
      columns={columns}
      data={rows}
      getRowHoverTarget={getRowHoverTarget}
      isRowInFilter={(row) => row.isActive}
      tableOptions={{ getRowId: (row) => row.id, enableSorting: false }}
      rowSeparator={(row, index) => {
        const prev = index > 0 ? rows[index - 1] : null;
        if (prev?.group === row.group) return null;
        return (
          <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
            {row.group}
          </p>
        );
      }}
    />
  );
}
