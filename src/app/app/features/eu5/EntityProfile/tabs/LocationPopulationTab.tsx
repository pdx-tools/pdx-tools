import { useMemo } from "react";
import type { LocationProfile, LocationPopRow } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { EChart } from "@/components/viz/EChart";
import type { EChartsOption } from "@/components/viz/EChart";

interface Props {
  profile: LocationProfile;
}

const columnHelper = createColumnHelper<LocationPopRow>();

const columns = [
  columnHelper.accessor("kind", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Kind" />,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("cultureName", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Culture" />,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("religionName", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Religion" />,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("size", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Size" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
  columnHelper.accessor("satisfaction", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Satisfaction" />,
    meta: { className: "text-right" },
    cell: (info) => `${formatFloat(info.getValue() * 100, 1)}%`,
  }),
  columnHelper.accessor("literacy", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Literacy" />,
    meta: { className: "text-right" },
    cell: (info) => `${formatFloat(info.getValue() * 100, 1)}%`,
  }),
];

const OTHER_COLOR = "#6b7280";

function buildSankeyOption(rows: LocationPopRow[]): EChartsOption {
  const totalSize = rows.reduce((s, r) => s + r.size, 0);
  if (totalSize === 0) return {};
  const threshold = totalSize * 0.02;

  // Compute per-religion and per-culture totals to identify minor groups
  const religionTotals = new Map<string, number>();
  const cultureTotals = new Map<string, number>();
  for (const row of rows) {
    religionTotals.set(row.religionName, (religionTotals.get(row.religionName) ?? 0) + row.size);
    cultureTotals.set(row.cultureName, (cultureTotals.get(row.cultureName) ?? 0) + row.size);
  }

  // Remap entries below threshold to "Others"
  const remapped = rows.map((row) => ({
    ...row,
    religionName:
      (religionTotals.get(row.religionName) ?? 0) >= threshold ? row.religionName : "Others",
    religionColorHex:
      (religionTotals.get(row.religionName) ?? 0) >= threshold ? row.religionColorHex : OTHER_COLOR,
    cultureName:
      (cultureTotals.get(row.cultureName) ?? 0) >= threshold ? row.cultureName : "Others",
    cultureColorHex:
      (cultureTotals.get(row.cultureName) ?? 0) >= threshold ? row.cultureColorHex : OTHER_COLOR,
  }));

  // Prefix religion/culture node names to guarantee global uniqueness in the graph.
  // Pop type names (e.g. "Peasants") cannot collide with each other so they stay plain.
  const rId = (name: string) => `r:${name}`;
  const cId = (name: string) => `c:${name}`;

  // Collect unique node IDs with their display colors
  // Order: religion (left) → pop type (middle) → culture (right)
  const religionColorMap = new Map<string, string>();
  const cultureColorMap = new Map<string, string>();
  for (const row of remapped) {
    religionColorMap.set(rId(row.religionName), row.religionColorHex);
    cultureColorMap.set(cId(row.cultureName), row.cultureColorHex);
  }
  const kindNames = [...new Set(remapped.map((r) => r.kind))];

  const nodes = [
    ...[...religionColorMap.entries()].map(([id, color]) => ({
      name: id,
      itemStyle: { color },
    })),
    ...kindNames.map((name) => ({ name })),
    ...[...cultureColorMap.entries()].map(([id, color]) => ({
      name: id,
      itemStyle: { color },
    })),
  ];

  // Build religion → pop_type and pop_type → culture link aggregations
  const religionKindMap = new Map<string, number>();
  const kindCultureMap = new Map<string, number>();
  for (const row of remapped) {
    const rkKey = `${rId(row.religionName)}||${row.kind}`;
    religionKindMap.set(rkKey, (religionKindMap.get(rkKey) ?? 0) + row.size);
    const kcKey = `${row.kind}||${cId(row.cultureName)}`;
    kindCultureMap.set(kcKey, (kindCultureMap.get(kcKey) ?? 0) + row.size);
  }

  const links = [
    ...[...religionKindMap.entries()].map(([key, value]) => {
      const [source, target] = key.split("||");
      return { source, target, value };
    }),
    ...[...kindCultureMap.entries()].map(([key, value]) => {
      const [source, target] = key.split("||");
      return { source, target, value };
    }),
  ];

  return {
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove",
      formatter: (params: unknown) => {
        const p = params as {
          name?: string;
          value?: number;
          data?: { source?: string; target?: string; value?: number };
        };
        const strip = (s?: string) => s?.replace(/^[rc]:/, "") ?? "";
        if (p.data?.source != null) {
          return `${strip(p.data.source)} → ${strip(p.data.target)}: ${formatInt(p.data.value ?? 0)}`;
        }
        return `${strip(p.name)}: ${formatInt(p.value ?? 0)}`;
      },
    },
    series: [
      {
        type: "sankey",
        emphasis: { focus: "adjacency" },
        nodeAlign: "left",
        label: {
          formatter: (params: unknown) => (params as { name: string }).name.replace(/^[rc]:/, ""),
          color: "#e2e8f0",
          fontSize: 11,
          backgroundColor: "rgba(15,23,42,0.7)",
          padding: [2, 5],
          borderRadius: 3,
        },
        data: nodes,
        links,
      },
    ],
  };
}

export function LocationPopulationTab({ profile }: Props) {
  const rows = profile.populationProfile;
  const sankeyOption = useMemo(() => buildSankeyOption(rows), [rows]);

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No population data.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <EChart option={sankeyOption} style={{ height: "320px", width: "100%" }} />
      <DataTable columns={columns} data={rows} initialSorting={[{ id: "size", desc: true }]} />
    </div>
  );
}
