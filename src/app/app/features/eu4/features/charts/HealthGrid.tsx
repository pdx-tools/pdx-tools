import { useCallback, useEffect } from "react";
import { formatFloat, formatInt } from "@/lib/format";
import { useVisualizationDispatch } from "@/components/viz";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { createCsv } from "@/lib/csv";
import { useTagFilter } from "../../store";
import { CountryHealth } from "../../types/models";
import { Flag } from "../../components/avatars";
import { Alert } from "@/components/Alert";
import { SortingFn, createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { HealthDatum, LeaderDatum } from "@/wasm/wasm_eu4";
import { GameIconSprite, iconSpriteTitle } from "../../components/icons";
import { LandForceStrengthTooltip } from "../../components/LandForceStrengthTooltip";
import { NavalForceStrengthTooltip } from "../../components/NavalForceStrengthTooltip";
import { DataTable } from "@/components/DataTable";
import { cx } from "class-variance-authority";
import { MoraleText } from "../../components/MoraleText";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const healthSort: SortingFn<any> = (rowA, rowB, column) =>
  rowA.getValue<HealthDatum>(column).value -
  rowB.getValue<HealthDatum>(column).value;

const columnHelper = createColumnHelper<CountryHealth>();
const columns = [
  columnHelper.accessor("name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Country" />
    ),
    cell: ({ row }) => <Flag tag={row.original.tag} name={row.original.name} />,
  }),

  columnHelper.accessor("coreIncome", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        icon={<GameIconSprite src="profit" alt="" />}
        title="Tax + production + trade + gold"
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => formatInt(info.getValue().value),
  }),

  columnHelper.accessor("treasuryBalance", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        icon={<GameIconSprite src="ducats" alt="" />}
        title={iconSpriteTitle.ducats}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => formatInt(info.getValue().value),
  }),

  columnHelper.accessor("development", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        icon={<GameIconSprite src="autonomy_development" alt="" />}
        title={iconSpriteTitle.autonomy_development}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => formatInt(info.getValue().value),
  }),

  columnHelper.accessor("buildings", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Buildings" />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => formatInt(info.getValue().value),
  }),

  columnHelper.accessor("inflation", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        icon={<GameIconSprite src="inflation" alt="" />}
        title={iconSpriteTitle.inflation}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => formatFloat(info.getValue().value, 2),
  }),

  columnHelper.accessor("bestGeneral", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        icon={<GameIconSprite src="general" alt="" />}
        title="Best general (by pips)"
      />
    ),
    meta: {
      className: (x: LeaderDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => {
      const general = info.getValue();
      return general.value === 0
        ? "---"
        : `(${formatInt(general.fire)} / ${formatInt(
            general.shock,
          )} / ${formatInt(general.maneuver)} / ${formatInt(general.siege)})`;
    },
  }),

  columnHelper.accessor("armyTradition", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        icon={<GameIconSprite src="army_tradition" alt="" />}
        title={iconSpriteTitle.army_tradition}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => formatFloat(info.getValue().value, 2),
  }),

  columnHelper.accessor("landMorale", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        title="Land morale (estimate)"
        icon={<GameIconSprite src="land_morale" alt="" />}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => <MoraleText value={info.getValue().value} />,
  }),

  columnHelper.accessor("forceStrength", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        title="Current force strength"
        icon={<GameIconSprite src="infantry" alt="" />}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => (
      <LandForceStrengthTooltip force={info.row.original.armedForces} />
    ),
  }),

  columnHelper.accessor("netManpower", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title="Net Manpower"
        className="justify-end"
        icon={<GameIconSprite src="manpower" alt="" />}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => `${formatInt(info.getValue().value)}K`,
  }),

  columnHelper.accessor("maxManpower", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={iconSpriteTitle.max_manpower}
        className="justify-end"
        icon={<GameIconSprite src="max_manpower" alt="" />}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => `${formatInt(info.getValue().value)}K`,
  }),

  columnHelper.accessor("professionalism", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={iconSpriteTitle.professionalism}
        className="justify-end"
        icon={<GameIconSprite src="professionalism" alt="" />}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => formatInt(info.getValue().value * 100) + "%",
  }),

  columnHelper.accessor("bestAdmiral", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        icon={<GameIconSprite src="admiral" alt="" />}
        title="Best admiral (by pips)"
      />
    ),
    meta: {
      className: (x: LeaderDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => {
      const general = info.getValue();
      return general.value === 0
        ? "---"
        : `(${formatInt(general.fire)} / ${formatInt(
            general.shock,
          )} / ${formatInt(general.maneuver)})`;
    },
  }),

  columnHelper.accessor("navalMorale", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        title="Naval morale (estimate)"
        icon={<GameIconSprite src="naval_morale" alt="" />}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => <MoraleText value={info.getValue().value} />,
  }),

  columnHelper.accessor("navyTradition", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        icon={<GameIconSprite src="navy_tradition" alt="" />}
        title={iconSpriteTitle.navy_tradition}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => formatFloat(info.getValue().value, 2),
  }),

  columnHelper.accessor("ships", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        icon={<GameIconSprite src="heavy_ship" alt="" />}
        title="Ships"
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => (
      <NavalForceStrengthTooltip forces={info.row.original.armedForces} />
    ),
  }),

  columnHelper.accessor("stability", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        icon={<GameIconSprite src="stability" alt="" />}
        title={iconSpriteTitle.stability}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => formatInt(info.getValue().value),
  }),

  columnHelper.accessor("technology", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Technology" />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => {
      const tech = info.getValue();
      return `(${formatInt(tech.adm)} / ${formatInt(tech.dip)} / ${formatInt(
        tech.mil,
      )})`;
    },
  }),

  columnHelper.accessor("ideas", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        icon={<GameIconSprite src="idea_groups" alt="" />}
        title={iconSpriteTitle.idea_groups}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => formatInt(info.getValue().value),
  }),

  columnHelper.accessor("corruption", {
    sortingFn: healthSort,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        icon={<GameIconSprite src="corruption" alt="" />}
        title={iconSpriteTitle.corruption}
      />
    ),
    meta: {
      className: (x: HealthDatum) =>
        cx("no-break text-right", colorToClass(x.color)),
    },
    cell: (info) => formatFloat(info.getValue().value, 2),
  }),
];

function colorToClass(x: number) {
  switch (x) {
    case 0:
      return "bg-red-700 text-white";
    case 1:
      return "bg-red-600 text-white";
    case 2:
      return "bg-red-500 text-white";
    case 3:
      return "bg-red-400 text-black";
    case 4:
      return "bg-red-300 text-black";
    case 5:
      return "bg-red-200 text-black";
    case 6:
      return "bg-red-100 text-black";
    case 7:
      return "bg-red-50 text-black";
    case 8:
      return "bg-blue-50 text-black";
    case 9:
      return "bg-blue-100 text-black";
    case 10:
      return "bg-blue-200 text-black";
    case 11:
      return "bg-blue-300 text-black";
    case 12:
      return "bg-blue-400 text-black";
    case 13:
      return "bg-blue-500 text-black";
    case 14:
      return "bg-blue-600 text-white";
    case 15:
      return "bg-blue-700 text-white";
  }
}

export const HealthGrid = () => {
  const countryFilter = useTagFilter();
  const visualizationDispatch = useVisualizationDispatch();

  const { data = [], error } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4GetHealth(countryFilter).then((x) => x.data),
      [countryFilter],
    ),
  );

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const columns = data.map(
          (x) =>
            [
              ["tag", x.tag],
              ["name", x.name],
              ["income", x.coreIncome.value],
              ["treasury_balance", x.treasuryBalance.value],
              ["development", x.development.value],
              ["buildings", x.buildings.value],
              ["inflation", x.inflation.value],
              ["general_fire", x.bestGeneral.fire],
              ["general_shock", x.bestGeneral.shock],
              ["general_maneuver", x.bestGeneral.maneuver],
              ["general_siege", x.bestGeneral.siege],
              ["land_morale", x.landMorale.value],
              ["army_tradition", x.armyTradition.value],
              ["manpower_balance", x.netManpower.value],
              ["force_strength", x.forceStrength.value],
              ["professionalism", x.professionalism.value],
              ["admiral_fire", x.bestAdmiral.fire],
              ["admiral_shock", x.bestAdmiral.shock],
              ["admiral_maneuver", x.bestAdmiral.maneuver],
              ["naval_morale", x.navalMorale.value],
              ["navy_tradition", x.navyTradition.value],
              ["ships", x.ships.value],
              ["stability", x.stability.value],
              ["adm_tech", x.technology.adm],
              ["dip_tech", x.technology.dip],
              ["mil_tech", x.technology.mil],
              ["ideas", x.ideas.value],
              ["corruption", x.corruption.value],
            ] as const,
        );

        const csvData = columns.map((x) => Object.fromEntries(x));
        const columnNames = columns[0].map(([name, _]) => name);
        return createCsv(csvData, columnNames);
      },
    });
  }, [data, visualizationDispatch]);

  return (
    <>
      <Alert.Error msg={error} />
      <DataTable
        columns={columns}
        data={data}
        size="small"
        enableColumnReordering={true}
        initialState={{
          columnPinning: {
            left: ["name"],
          },
        }}
      />
    </>
  );
};
