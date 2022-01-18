import React, { useRef } from "react";
import { Table } from "antd";
import { ColumnGroupType, ColumnType } from "antd/lib/table";
import { PlusCircleTwoTone, MinusCircleTwoTone } from "@ant-design/icons";
import { TableLosses, useCountryCasualtyData } from "./hooks";
import { useIsLoading } from "@/components/viz/visualization-context";
import { formatInt } from "@/lib/format";
import { ExpandableConfig } from "antd/lib/table/interface";
import { CountriesArmyCasualtiesWarTable } from "./CountriesArmyCasualtiesWarTable";
import { FlagAvatar } from "@/features/eu4/components/avatars";
import { countryColumnFilter } from "../countryColumnFilter";

export const CountriesArmyCasualtiesTable: React.FC<{}> = () => {
  const data = useCountryCasualtyData();
  const isLoading = useIsLoading();
  const numRenderer = (x: number) => formatInt(x);
  const selectFilterRef = useRef(null);

  const unitTypes = [
    ["Inf", "infantry"],
    ["Cav", "cavalry"],
    ["Art", "artillery"],
    ["Total", "landTotal"],
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
      title: "% from Attrition",
      key: "percent-attrition",
      align: "right",
      render: (_x: any, x: TableLosses) =>
        `${formatInt((x.landTotalAttrition / x.landTotal) * 100)}%`,
      sorter: {
        multiple: 2,
        compare: (a: TableLosses, b: TableLosses) =>
          a.landTotalAttrition / a.landTotal -
          b.landTotalAttrition / b.landTotal,
      },
    },
    {
      title: "Total Losses",
      dataIndex: "landTotal",
      align: "right",
      render: numRenderer,
      defaultSortOrder: "descend",
      sorter: {
        multiple: 1,
        compare: (a: TableLosses, b: TableLosses) =>
          a[`landTotal`] - b[`landTotal`],
      },
    },
  ];

  const expandable: ExpandableConfig<TableLosses> = {
    expandedRowRender: (record: TableLosses) => (
      <CountriesArmyCasualtiesWarTable record={record} />
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
