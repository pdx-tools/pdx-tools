import { FailedHeir, RunningMonarch } from "../../types/models";
import { formatFloat, formatInt } from "@/lib/format";
import { Flag, PersonalityAvatar } from "@/features/eu4/components/avatars";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { HelpTooltip } from "@/components/HelpTooltip";
import { SheetExpansion } from "../../components/SheetExpansion";

interface CountryRulersTableProps {
  rulers: RunningMonarch[];
}

const columnHelper = createColumnHelper<RunningMonarch>();
const columns = [
  columnHelper.display({
    id: "actions",
    cell: ({ row }) =>
      row.original.failed_heirs.length == 0 ? null : (
        <SheetExpansion
          title={`Abdicated or deceased heirs before ${row.original.name}`}
        >
          <DataTable columns={heirColumns} data={row.original.failed_heirs} />
        </SheetExpansion>
      ),
  }),

  columnHelper.accessor("name", {
    header: "Name",
    meta: { className: "min-w-[150px]" },
  }),

  columnHelper.accessor("start", {
    header: "Start",
    meta: { className: "no-break text-right" },
  }),

  columnHelper.accessor("end", {
    header: "End",
    meta: { className: "no-break text-right" },
    cell: (info) => info.getValue() ?? "---",
  }),

  columnHelper.accessor("reign", {
    header: "Reign (months)",
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("country", {
    header: "Tag",
    cell: (info) => (
      <Flag
        name={info.getValue().name}
        tag={info.getValue().tag}
        condensed={true}
      />
    ),
  }),

  columnHelper.accessor("personalities", {
    header: "Personalities",
    cell: (info) => (
      <ul className="flex items-center">
        {info.getValue().map((personality) => (
          <li key={personality.id}>
            <PersonalityAvatar {...personality} />
          </li>
        ))}
      </ul>
    ),
  }),

  columnHelper.group({
    header: "Stats",
    columns: [
      columnHelper.accessor("adm", {
        header: "ADM",
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
      columnHelper.accessor("dip", {
        header: "DIP",
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
      columnHelper.accessor("mil", {
        header: "MIL",
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
      columnHelper.accessor((x) => x.adm + x.dip + x.mil, {
        header: "Total",
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ],
  }),

  columnHelper.group({
    id: "Running Average Stats",
    header: () => (
      <div>
        Running Average Stats
        <HelpTooltip
          className="ml-1"
          help="Not accurate for election governments"
        />
      </div>
    ),
    columns: [
      columnHelper.accessor("avg_adm", {
        header: "ADM",
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      columnHelper.accessor("avg_dip", {
        header: "DIP",
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      columnHelper.accessor("avg_mil", {
        header: "MIL",
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      columnHelper.accessor((x) => x.avg_adm + x.avg_dip + x.avg_mil, {
        id: "avg_total",
        header: "Total",
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
    ],
  }),

  columnHelper.group({
    id: "Reign Weighted Running Average Stats",
    header: () => (
      <div>
        Reign Weighted Running Average Stats
        <HelpTooltip
          className="ml-1"
          help="Not accurate for election governments"
        />
      </div>
    ),
    columns: [
      columnHelper.accessor("avg_dur_adm", {
        header: "ADM",
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      columnHelper.accessor("avg_dur_dip", {
        header: "DIP",
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      columnHelper.accessor("avg_dur_mil", {
        header: "MIL",
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
      columnHelper.accessor(
        (x) => x.avg_dur_adm + x.avg_dur_dip + x.avg_dur_mil,
        {
          id: "avg_dur_total",
          header: "Total",
          meta: { className: "text-right" },
          cell: (info) => formatFloat(info.getValue(), 2),
        },
      ),
    ],
  }),
];

const heirColumnsHelper = createColumnHelper<FailedHeir>();
const heirColumns = [
  heirColumnsHelper.accessor("name", {
    header: "Heir",
    meta: { className: "min-w-[150px]" },
  }),

  heirColumnsHelper.accessor("birth", {
    header: "Birth",
    meta: { className: "no-break text-right" },
  }),

  heirColumnsHelper.accessor("country", {
    header: "Tag",
    cell: (info) => (
      <Flag
        name={info.getValue().name}
        tag={info.getValue().tag}
        condensed={true}
      />
    ),
  }),

  heirColumnsHelper.accessor("personalities", {
    header: "Personalities",
    cell: (info) => (
      <ul className="flex items-center">
        {info.getValue().map((personality) => (
          <li key={personality.id}>
            <PersonalityAvatar {...personality} />
          </li>
        ))}
      </ul>
    ),
  }),

  heirColumnsHelper.accessor("adm", {
    header: "ADM",
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
  heirColumnsHelper.accessor("dip", {
    header: "DIP",
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
  heirColumnsHelper.accessor("mil", {
    header: "MIL",
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
  heirColumnsHelper.accessor((x) => x.adm + x.dip + x.mil, {
    header: "Total",
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

export const CountryRulersTable = ({ rulers }: CountryRulersTableProps) => {
  return <DataTable columns={columns} data={rulers} />;
};
