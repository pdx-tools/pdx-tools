import React, { useCallback, useState } from "react";
import { Table, Tooltip } from "antd";
import { ColumnGroupType, ColumnType } from "antd/lib/table";
import { TableLosses } from "./hooks";
import { useIsLoading } from "@/components/viz";
import { SingleCountryWarCasualties } from "@/features/eu4/types/models";
import { useAnalysisWorker, WorkerClient } from "@/features/engine";
import { formatInt } from "@/lib/format";

interface CountryArmyCasualtiesWarTableProps {
  record: TableLosses;
}

export const CountriesArmyCasualtiesWarTable = ({
  record,
}: CountryArmyCasualtiesWarTableProps) => {
  const [wars, setWars] = useState([] as SingleCountryWarCasualties[]);
  const isLoading = useIsLoading();

  const cb = useCallback(
    async (worker: WorkerClient) => {
      const data = await worker.eu4GetSingleCountryCasualties(record.tag);
      setWars(data);
    },
    [record.tag]
  );
  useAnalysisWorker(cb);

  const unitTypes = [
    ["Inf", "infantry"],
    ["Cav", "cavalry"],
    ["Art", "artillery"],
    ["Total", "landTotal"],
  ];

  const battleColumns: ColumnType<SingleCountryWarCasualties>[] = unitTypes.map(
    ([title, type]) => ({
      title,
      dataIndex: ["losses", `${type}Battle`],
      align: "right",
      render: formatInt,
      sorter: (a: any, b: any) =>
        a.losses[`${type}Battle`] - b.losses[`${type}Battle`],
      className: title === "Total" ? "antd-column-separator" : undefined,
    })
  );

  const attritionColumns: ColumnType<SingleCountryWarCasualties>[] =
    unitTypes.map(([title, type]) => ({
      title,
      dataIndex: ["losses", `${type}Attrition`],
      align: "right",
      render: formatInt,
      sorter: (a: any, b: any) =>
        a.losses[`${type}Attrition`] - b.losses[`${type}Attrition`],
      className: title === "Total" ? "antd-column-separator" : undefined,
    }));

  const columns: (
    | ColumnGroupType<SingleCountryWarCasualties>
    | ColumnType<SingleCountryWarCasualties>
  )[] = [
    {
      title: "War",
      dataIndex: "war",
      fixed: "left",
      width: 175,
      sorter: (a: SingleCountryWarCasualties, b: SingleCountryWarCasualties) =>
        a.war.localeCompare(b.war),
    },
    {
      title: "Start",
      dataIndex: "start",
      className: "no-break",
      render: (date: string) => date || "---",
    },
    {
      title: "End",
      dataIndex: "end",
      className: "no-break",
      render: (date: string) => date || "---",
    },
    {
      title: "Participation",
      dataIndex: "participation",
      render: (_name: string, x: SingleCountryWarCasualties) => (
        <Tooltip title={x.participation}>{`${formatInt(
          x.participation_percent * 100
        )}%`}</Tooltip>
      ),
      sorter: (a: SingleCountryWarCasualties, b: SingleCountryWarCasualties) =>
        a.participation - b.participation,
    },
    {
      title: "Battle Losses",
      children: battleColumns,
    },
    {
      title: "Attrition Losses",
      children: attritionColumns,
    },
    {
      title: "% from Attrition",
      key: "percent-attrition",
      align: "right",
      render: (_x: any, x: SingleCountryWarCasualties) =>
        `${formatInt(
          (x.losses.landTotalAttrition / (x.losses.landTotal || 1)) * 100
        )}%`,
      sorter: {
        multiple: 2,
        compare: (
          a: SingleCountryWarCasualties,
          b: SingleCountryWarCasualties
        ) =>
          a.losses.landTotalAttrition / (a.losses.landTotal || 1) -
          b.losses.landTotalAttrition / (b.losses.landTotal || 1),
      },
    },
    {
      title: "Total Losses",
      dataIndex: ["losses", "landTotal"],
      align: "right",
      render: formatInt,
      sorter: {
        multiple: 1,
        compare: (
          a: SingleCountryWarCasualties,
          b: SingleCountryWarCasualties
        ) => a.losses[`landTotal`] - b.losses[`landTotal`],
      },
    },
  ];

  function createSummary(rows: readonly SingleCountryWarCasualties[]) {
    const total = rows
      .map((x) => x.losses.landTotal)
      .reduce((a, b) => a + b, 0);
    const totalAttrition = rows
      .map((x) => x.losses.landTotalAttrition)
      .reduce((a, b) => a + b, 0);
    return (
      <Table.Summary.Row>
        <Table.Summary.Cell key="other-label" index={0} colSpan={3}>
          Friendly Attrition / Rebels
        </Table.Summary.Cell>
        <Table.Summary.Cell
          key="battle-inf"
          colSpan={2}
          index={4}
          align="right"
        >
          {formatInt(
            record.infantryBattle -
              rows
                .map((x) => x.losses.infantryBattle)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="battle-cav" index={5} align="right">
          {formatInt(
            record.cavalryBattle -
              rows.map((x) => x.losses.cavalryBattle).reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="battle-art" index={6} align="right">
          {formatInt(
            record.artilleryBattle -
              rows
                .map((x) => x.losses.artilleryBattle)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell
          key="battle-total"
          index={7}
          align="right"
          className="antd-column-separator"
        >
          {formatInt(
            record.landTotalBattle -
              rows
                .map((x) => x.losses.landTotalBattle)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="attrition-inf" index={8} align="right">
          {formatInt(
            record.infantryAttrition -
              rows
                .map((x) => x.losses.infantryAttrition)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="attrition-cav" index={9} align="right">
          {formatInt(
            record.cavalryAttrition -
              rows
                .map((x) => x.losses.cavalryAttrition)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="attrition-art" index={10} align="right">
          {formatInt(
            record.artilleryAttrition -
              rows
                .map((x) => x.losses.artilleryAttrition)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell
          key="attrition-total"
          index={11}
          align="right"
          className="antd-column-separator"
        >
          {formatInt(record.landTotalAttrition - totalAttrition)}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="attrition-percent" index={12} align="right">
          {`${formatInt(
            ((record.landTotalAttrition - totalAttrition) /
              (record.landTotal - total)) *
              100
          )}%`}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="total" index={13} align="right">
          {formatInt(record.landTotal - total)}
        </Table.Summary.Cell>
      </Table.Summary.Row>
    );
  }

  return (
    <Table
      size="small"
      rowKey="war"
      loading={isLoading}
      scroll={{ x: true }}
      dataSource={wars}
      columns={columns}
      pagination={false}
      summary={createSummary}
      locale={{
        emptyText: `${record.name} did not participate in any wars`,
      }}
    />
  );
};
