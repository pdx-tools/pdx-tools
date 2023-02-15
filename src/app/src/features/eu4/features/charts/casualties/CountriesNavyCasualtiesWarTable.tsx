import React, { useCallback } from "react";
import { Table, Tooltip } from "antd";
import { ColumnGroupType, ColumnType } from "antd/lib/table";
import { TableLosses } from "./hooks";
import { useIsLoading } from "@/components/viz";
import { SingleCountryWarCasualties } from "@/features/eu4/types/models";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { formatInt } from "@/lib/format";

interface CountryNavyCasualtiesWarTableProps {
  record: TableLosses;
}

export const CountriesNavyCasualtiesWarTable = ({
  record,
}: CountryNavyCasualtiesWarTableProps) => {
  const isLoading = useIsLoading();
  const { data: wars } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4GetSingleCountryCasualties(record.tag),
      [record.tag]
    )
  );

  const unitTypes = [
    ["Heavy", "heavyShip"],
    ["Light", "lightShip"],
    ["Galley", "galleyShip"],
    ["Trnsprt", "transportShip"],
    ["Total", "navyTotal"],
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

  const captureColumns: ColumnType<SingleCountryWarCasualties>[] =
    unitTypes.map(([title, type]) => ({
      title,
      dataIndex: ["losses", `${type}Capture`],
      align: "right",
      render: formatInt,
      sorter: (a: any, b: any) =>
        a.losses[`${type}Capture`] - b.losses[`${type}Capture`],
      className: title === "Total" ? "antd-column-separator" : undefined,
    }));

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
      title: "Losses from Captured Ships",
      children: captureColumns,
    },
    {
      title: "% from Attrition",
      key: "percent-attrition",
      align: "right",
      render: (_x: any, x: SingleCountryWarCasualties) =>
        `${formatInt(
          (x.losses.navyTotalAttrition / (x.losses.navyTotal || 1)) * 100
        )}%`,
      sorter: {
        multiple: 2,
        compare: (
          a: SingleCountryWarCasualties,
          b: SingleCountryWarCasualties
        ) =>
          a.losses.navyTotalAttrition / (a.losses.navyTotal || 1) -
          b.losses.navyTotalAttrition / (b.losses.navyTotal || 1),
      },
    },
    {
      title: "Total Losses",
      dataIndex: ["losses", "navyTotal"],
      align: "right",
      render: formatInt,
      sorter: {
        multiple: 1,
        compare: (
          a: SingleCountryWarCasualties,
          b: SingleCountryWarCasualties
        ) => a.losses[`navyTotal`] - b.losses[`navyTotal`],
      },
    },
  ];

  function createSummary(rows: readonly SingleCountryWarCasualties[]) {
    const total = rows
      .map((x) => x.losses.navyTotal)
      .reduce((a, b) => a + b, 0);
    const totalAttrition = rows
      .map((x) => x.losses.navyTotalAttrition)
      .reduce((a, b) => a + b, 0);
    return (
      <Table.Summary.Row>
        <Table.Summary.Cell key="other-label" index={0} colSpan={3}>
          Other
        </Table.Summary.Cell>
        <Table.Summary.Cell
          key="battle-heavy"
          colSpan={2}
          index={4}
          align="right"
        >
          {formatInt(
            record.heavyShipBattle -
              rows
                .map((x) => x.losses.heavyShipBattle)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell
          key="battle-light"
          colSpan={1}
          index={4}
          align="right"
        >
          {formatInt(
            record.lightShipBattle -
              rows
                .map((x) => x.losses.lightShipBattle)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="battle-galley" index={5} align="right">
          {formatInt(
            record.galleyShipBattle -
              rows
                .map((x) => x.losses.galleyShipBattle)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="battle-transport" index={7} align="right">
          {formatInt(
            record.transportShipBattle -
              rows
                .map((x) => x.losses.transportShipBattle)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell
          key="battle-total"
          index={8}
          align="right"
          className="antd-column-separator"
        >
          {formatInt(
            record.navyTotalBattle -
              rows
                .map((x) => x.losses.navyTotalBattle)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="attrition-heavy" index={9} align="right">
          {formatInt(
            record.heavyShipAttrition -
              rows
                .map((x) => x.losses.heavyShipAttrition)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="attrition-light" index={10} align="right">
          {formatInt(
            record.lightShipAttrition -
              rows
                .map((x) => x.losses.lightShipAttrition)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="attrition-galley" index={11} align="right">
          {formatInt(
            record.galleyShipAttrition -
              rows
                .map((x) => x.losses.galleyShipAttrition)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="attrition-transport" index={12} align="right">
          {formatInt(
            record.transportShipAttrition -
              rows
                .map((x) => x.losses.transportShipAttrition)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell
          key="attrition-total"
          index={13}
          align="right"
          className="antd-column-separator"
        >
          {formatInt(record.navyTotalAttrition - totalAttrition)}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="capture-heavy" index={14} align="right">
          {formatInt(
            record.heavyShipCapture -
              rows
                .map((x) => x.losses.heavyShipCapture)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="capture-light" index={15} align="right">
          {formatInt(
            record.lightShipCapture -
              rows
                .map((x) => x.losses.lightShipCapture)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="capture-galley" index={16} align="right">
          {formatInt(
            record.galleyShipCapture -
              rows
                .map((x) => x.losses.galleyShipCapture)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell key="capture-transport" index={17} align="right">
          {formatInt(
            record.transportShipCapture -
              rows
                .map((x) => x.losses.transportShipCapture)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>
        <Table.Summary.Cell
          key="capture-total"
          index={18}
          align="right"
          className="antd-column-separator"
        >
          {formatInt(
            record.navyTotalCapture -
              rows
                .map((x) => x.losses.navyTotalCapture)
                .reduce((a, b) => a + b, 0)
          )}
        </Table.Summary.Cell>

        <Table.Summary.Cell key="total" index={20} colSpan={2} align="right">
          {formatInt(record.navyTotal - total)}
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
