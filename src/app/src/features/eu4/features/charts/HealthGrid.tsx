import React, { useCallback, useEffect } from "react";
import { formatFloat, formatInt } from "@/lib/format";
import { useVisualizationDispatch } from "@/components/viz";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { createCsv } from "@/lib/csv";
import { useTagFilter } from "../../store";
import { Table, Tooltip } from "antd";
import { CountryHealth } from "../../types/models";
import { FlagAvatar } from "../../components/avatars";
import { ColumnType } from "antd/lib/table";

// colors from bg-red-700 to bg-blue-700. But using styles as antd has too high
// of specificity: https://stackoverflow.com/q/68656826/433785
function colorToStyle(x: number) {
  switch (x) {
    case 0:
      return { backgroundColor: "#b91c1c", color: "white" };
    case 1:
      return { backgroundColor: "#dc2626", color: "white" };
    case 2:
      return { backgroundColor: "#ef4444", color: "white" };
    case 3:
      return { backgroundColor: "#f87171" };
    case 4:
      return { backgroundColor: "#fca5a5" };
    case 5:
      return { backgroundColor: "#fecaca" };
    case 6:
      return { backgroundColor: "#fee2e2" };
    case 7:
      return { backgroundColor: "#fef2f2" };
    case 8:
      return { backgroundColor: "#eff6ff" };
    case 9:
      return { backgroundColor: "#dbeafe" };
    case 10:
      return { backgroundColor: "#bfdbfe" };
    case 11:
      return { backgroundColor: "#93c5fd" };
    case 12:
      return { backgroundColor: "#60a5fa" };
    case 13:
      return { backgroundColor: "#3b82f6" };
    case 14:
      return { backgroundColor: "#2563eb", color: "white" };
    case 15:
      return { backgroundColor: "#1d4ed8", color: "white" };
  }
}

export const HealthGrid = () => {
  const countryFilter = useTagFilter();
  const visualizationDispatch = useVisualizationDispatch();

  const { data = [] } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4GetHealth(countryFilter).then((x) => x.data),
      [countryFilter]
    )
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
              ["general_manuever", x.bestGeneral.manuever],
              ["general_siege", x.bestGeneral.siege],
              ["army_tradition", x.armyTradition.value],
              ["manpower_balance", x.manpowerBalance.value],
              ["regiments", x.standardRegiments.value],
              ["professionalism", x.professionalism.value],
              ["admiral_fire", x.bestAdmiral.fire],
              ["admiral_shock", x.bestAdmiral.shock],
              ["admiral_manuever", x.bestAdmiral.manuever],
              ["navy_tradition", x.navyTradition.value],
              ["ships", x.ships.value],
              ["stability", x.stability.value],
              ["adm_tech", x.technology.adm],
              ["dip_tech", x.technology.dip],
              ["mil_tech", x.technology.mil],
              ["ideas", x.ideas.value],
              ["corruption", x.corruption.value],
            ] as const
        );

        const csvData = columns.map((x) => Object.fromEntries(x));
        const columnNames = columns[0].map(([name, _]) => name);
        return createCsv(csvData, columnNames);
      },
    });
  }, [data, visualizationDispatch]);

  const columns: ColumnType<CountryHealth>[] = [
    {
      title: "Country",
      dataIndex: "name",
      className: "no-break",
      fixed: "left",
      width: 175,
      render: (_name: string, x: CountryHealth) => (
        <FlagAvatar tag={x.tag} name={x.name} size="large" />
      ),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.name.localeCompare(b.name),
    },
    {
      title: () => (
        <Tooltip title="Tax + production + trade + gold">Income</Tooltip>
      ),
      showSorterTooltip: false,
      dataIndex: "coreIncome",
      className: "no-break",
      align: "right",
      render: (_, record) => formatInt(record.coreIncome.value),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.coreIncome.value - b.coreIncome.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.coreIncome.color),
      }),
    },
    {
      title: <Tooltip title="Current treasury minus loans">Treasury</Tooltip>,
      showSorterTooltip: false,
      dataIndex: "treasuryBalance",
      className: "no-break",
      align: "right",
      render: (_, record) => formatInt(record.treasuryBalance.value),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.treasuryBalance.value - b.treasuryBalance.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.treasuryBalance.color),
      }),
    },
    {
      title: (
        <Tooltip title="Autonomy adjusted development">Development</Tooltip>
      ),
      showSorterTooltip: false,
      dataIndex: "development",
      className: "no-break",
      align: "right",
      render: (_, record) => formatInt(record.development.value),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.development.value - b.development.value,
      defaultSortOrder: "descend",
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.development.color),
      }),
    },
    {
      title: "Buildings",
      dataIndex: "buildings",
      className: "no-break",
      align: "right",
      render: (_, record) => formatInt(record.buildings.value),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.buildings.value - b.buildings.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.buildings.color),
      }),
    },
    {
      title: "Inflation",
      dataIndex: "inflation",
      className: "no-break",
      align: "right",
      render: (_, record) => formatFloat(record.inflation.value, 2),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.inflation.value - b.inflation.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.inflation.color),
      }),
    },
    {
      title: <Tooltip title="General with most pips">Generals</Tooltip>,
      showSorterTooltip: false,
      dataIndex: "bestGeneral",
      className: "no-break",
      align: "right",
      render: (_, record) =>
        record.bestGeneral.value === 0
          ? "---"
          : `(${record.bestGeneral.fire} / ${record.bestGeneral.shock} / ${record.bestGeneral.manuever} / ${record.bestGeneral.siege})`,
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.bestGeneral.value - b.bestGeneral.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.bestGeneral.color),
      }),
    },
    {
      title: <Tooltip title="Army Tradition">AT</Tooltip>,
      showSorterTooltip: false,
      dataIndex: "armyTradition",
      className: "no-break",
      align: "right",
      render: (_, record) => formatFloat(record.armyTradition.value, 2),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.armyTradition.value - b.armyTradition.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.armyTradition.color),
      }),
    },
    {
      title: (
        <Tooltip title="Manpower leftover after reinforcing all units">
          Manpower
        </Tooltip>
      ),
      showSorterTooltip: false,
      dataIndex: "manpowerBalance",
      className: "no-break",
      align: "right",
      render: (_, record) => formatInt(record.manpowerBalance.value),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.manpowerBalance.value - b.manpowerBalance.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.manpowerBalance.color),
      }),
    },
    {
      title: (
        <Tooltip title="Regiments (excludes mercenaries)">Regiments</Tooltip>
      ),
      showSorterTooltip: false,
      dataIndex: "standardRegiments",
      className: "no-break",
      align: "right",
      render: (_, record) => formatInt(record.standardRegiments.value),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.standardRegiments.value - b.standardRegiments.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.standardRegiments.color),
      }),
    },
    {
      title: <Tooltip title="Professionalism">Prof</Tooltip>,
      showSorterTooltip: false,
      dataIndex: "professionalism",
      className: "no-break",
      align: "right",
      render: (_, record) =>
        formatInt(record.professionalism.value * 100) + "%",
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.professionalism.value - b.professionalism.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.professionalism.color),
      }),
    },
    {
      title: (
        <Tooltip title="Admiral with the most pips (excludes siege pip)">
          Admirals
        </Tooltip>
      ),
      showSorterTooltip: false,
      dataIndex: "bestAdmiral",
      className: "no-break",
      align: "right",
      render: (_, record) =>
        record.bestAdmiral.value === 0
          ? "---"
          : `(${record.bestAdmiral.fire} / ${record.bestAdmiral.shock} / ${record.bestAdmiral.manuever})`,
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.bestAdmiral.value - b.bestAdmiral.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.bestAdmiral.color),
      }),
    },
    {
      title: <Tooltip title="Navy Tradition">NT</Tooltip>,
      showSorterTooltip: false,
      dataIndex: "navyTradition",
      className: "no-break",
      align: "right",
      render: (_, record) => formatFloat(record.navyTradition.value, 2),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.navyTradition.value - b.navyTradition.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.navyTradition.color),
      }),
    },
    {
      title: "Ships",
      dataIndex: "boats",
      className: "no-break",
      align: "right",
      render: (_, record) => formatInt(record.ships.value),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.ships.value - b.ships.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.ships.color),
      }),
    },
    {
      title: "Stability",
      dataIndex: "stability",
      className: "no-break",
      align: "right",
      render: (_, record) => formatInt(record.stability.value),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.stability.value - b.stability.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.stability.color),
      }),
    },
    {
      title: "Technology",
      dataIndex: "technology",
      className: "no-break",
      align: "right",
      render: (_, record) =>
        `(${record.technology.adm} / ${record.technology.dip} / ${record.technology.mil})`,
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.technology.value - b.technology.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.technology.color),
      }),
    },
    {
      title: "Ideas",
      dataIndex: "ideas",
      className: "no-break",
      align: "right",
      render: (_, record) => formatInt(record.ideas.value),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.ideas.value - b.ideas.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.ideas.color),
      }),
    },
    {
      title: "Corruption",
      dataIndex: "corruption",
      className: "no-break",
      align: "right",
      render: (_, record) => formatFloat(record.corruption.value, 2),
      sorter: (a: CountryHealth, b: CountryHealth) =>
        a.corruption.value - b.corruption.value,
      onCell: (record: CountryHealth) => ({
        style: colorToStyle(record.corruption.color),
      }),
    },
  ];

  return (
    <Table
      rowKey="tag"
      size="small"
      columns={columns}
      scroll={{ x: true }}
      dataSource={data}
      pagination={false}
    />
  );
};
