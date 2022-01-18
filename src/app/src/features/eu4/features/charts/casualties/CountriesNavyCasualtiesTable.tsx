import React, { useRef } from "react";
import { Table } from "antd";
import { ColumnGroupType, ColumnType } from "antd/lib/table";
import { PlusCircleTwoTone, MinusCircleTwoTone } from "@ant-design/icons";
import { TableLosses, useCountryCasualtyData } from "./hooks";
import { ExpandableConfig } from "antd/lib/table/interface";
import { CountriesNavyCasualtiesWarTable } from "./CountriesNavyCasualtiesWarTable";
import { FlagAvatar } from "@/features/eu4/components/avatars";
import { useIsLoading } from "@/components/viz";
import { formatInt } from "@/lib/format";
import { countryColumnFilter } from "../countryColumnFilter";

export const CountriesNavyCasualtiesTable: React.FC<{}> = () => {
  const data = useCountryCasualtyData();
  const isLoading = useIsLoading();
  const selectFilterRef = useRef(null);

  const numRenderer = (x: number) => formatInt(x);

  const unitTypes = [
    ["Heavy", "heavyShip"],
    ["Light", "lightShip"],
    ["Galley", "galleyShip"],
    ["Trnsprt", "transportShip"],
    ["Total", "navyTotal"],
  ];

  const battleColumns: ColumnType<TableLosses>[] = unitTypes.map(
    ([title, type]) => ({
      title,
      dataIndex: `${type}Battle`,
      align: "right",
      render: numRenderer,
      sorter: (a: any, b: any) => a[`${type}Battle`] - b[`${type}Battle`],
      className: title === "Total" ? "antd-column-separator" : undefined,
    })
  );

  const captureColumns: ColumnType<TableLosses>[] = unitTypes.map(
    ([title, type]) => ({
      title,
      dataIndex: `${type}Capture`,
      align: "right",
      render: numRenderer,
      sorter: (a: any, b: any) => a[`${type}Capture`] - b[`${type}Capture`],
      className: title === "Total" ? "antd-column-separator" : undefined,
    })
  );

  const attritionColumns: ColumnType<TableLosses>[] = unitTypes.map(
    ([title, type]) => ({
      title,
      dataIndex: `${type}Attrition`,
      align: "right",
      render: numRenderer,
      sorter: (a: any, b: any) => a[`${type}Attrition`] - b[`${type}Attrition`],
      className: title === "Total" ? "antd-column-separator" : undefined,
    })
  );

  const columns: (ColumnGroupType<TableLosses> | ColumnType<TableLosses>)[] = [
    {
      title: "Country",
      dataIndex: "name",
      fixed: "left",
      width: 175,
      render: (_name: string, x: TableLosses) => (
        <FlagAvatar tag={x.tag} name={x.name} size="large" />
      ),
      sorter: (a: TableLosses, b: TableLosses) => a.name.localeCompare(b.name),
      ...countryColumnFilter(selectFilterRef, (record) => record.tag),
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
      title: "Total Losses",
      dataIndex: "navyTotal",
      align: "right",
      render: numRenderer,
      defaultSortOrder: "descend",
      sorter: (a: TableLosses, b: TableLosses) =>
        a[`navyTotal`] - b[`navyTotal`],
    },
  ];

  const expandable: ExpandableConfig<TableLosses> = {
    expandedRowRender: (record: TableLosses) => (
      <CountriesNavyCasualtiesWarTable record={record} />
    ),
    expandIcon: ({ expanded, onExpand, record }) =>
      expanded ? (
        <MinusCircleTwoTone onClick={(e) => onExpand(record, e)} />
      ) : (
        <PlusCircleTwoTone onClick={(e) => onExpand(record, e)} />
      ),
  };

  return (
    <Table
      size="small"
      rowKey="name"
      loading={isLoading}
      scroll={{ x: true }}
      dataSource={data}
      columns={columns}
      expandable={expandable}
    />
  );
};
