import React, { useCallback, useEffect, useState } from "react";
import { Input, Table } from "antd";
import { PlusCircleTwoTone, MinusCircleTwoTone } from "@ant-design/icons";
import { ColumnGroupType, ColumnType } from "antd/lib/table";
import { BattleView } from "./BattleView";
import { War, WarSide } from "../../types/models";
import { ExpandableConfig } from "rc-table/lib/interface";
import { FilterIcon } from "@/components/icons";
import { formatInt } from "@/lib/format";
import { useWorkerOnSave, WorkerClient } from "@/features/engine";
import { useSelector } from "react-redux";
import { selectEu4CountryFilter } from "@/features/eu4/eu4Slice";
import { FlagAvatar } from "@/features/eu4/components/avatars";
import { createCsv } from "@/lib/csv";
import { useVisualizationDispatch } from "@/components/viz";
import { useTablePagination } from "@/features/ui-controls";

interface WarSideData extends WarSide {
  original_name: string;
}

interface WarTableData extends War {
  key: number;
  attackers: WarSideData;
  defenders: WarSideData;
}

export const WarTable = () => {
  const [data, setData] = useState<WarTableData[]>([]);
  const filter = useSelector(selectEu4CountryFilter);
  const tablePagination = useTablePagination();
  const visualizationDispatch = useVisualizationDispatch();
  const cb = useCallback(
    async (worker: WorkerClient) => {
      const data = await worker.eu4GetWars(filter);
      const result = data.map((x, i) => {
        return {
          key: i,
          ...x,
        };
      });
      setData(result);
    },
    [filter]
  );

  useWorkerOnSave(cb);

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const dataCsv = data.map((x) => ({
          ...x,
          attacker_main: x.attackers.original,
          attacker_main_name: x.attackers.original_name,
          attacker_members: `"{${x.attackers.members.join(",")}}"`,
          attacker_battle_losses: x.attackers.losses.totalBattle,
          attacker_attrition_losses: x.attackers.losses.totalAttrition,
          defender_main: x.defenders.original,
          defender_main_name: x.defenders.original_name,
          defender_members: `"{${x.defenders.members.join(",")}}"`,
          defender_battle_losses: x.defenders.losses.totalBattle,
          defender_attrition_losses: x.defenders.losses.totalAttrition,
        }));

        return createCsv(dataCsv, [
          "name",
          "start_date",
          "end_date",
          "days",
          "attacker_main",
          "attacker_main_name",
          "attacker_members",
          "attacker_battle_losses",
          "attacker_attrition_losses",
          "defender_main",
          "defender_main_name",
          "defender_members",
          "defender_battle_losses",
          "defender_attrition_losses",
          "battles",
        ]);
      },
    });
  }, [data, visualizationDispatch]);

  const columns: (ColumnGroupType<WarTableData> | ColumnType<WarTableData>)[] =
    [
      {
        title: "War",
        dataIndex: "name",
        fixed: "left",
        width: 175,
        sorter: (a: WarTableData, b: WarTableData) =>
          a.name.localeCompare(b.name),
        filterDropdown: ({
          setSelectedKeys,
          selectedKeys,
          confirm,
          clearFilters,
        }) => (
          <div>
            <Input
              value={selectedKeys[0]}
              onChange={(e) => {
                setSelectedKeys(e.target.value ? [e.target.value] : []);
              }}
              onPressEnter={() => {
                if (!selectedKeys[0] && clearFilters) {
                  clearFilters();
                }
                confirm({
                  closeDropdown: true,
                });
              }}
            />
          </div>
        ),
        filterIcon: (filtered) => <FilterIcon filtered={filtered} />,
        onFilter: (value: string | number | boolean, record: WarTableData) =>
          record.name.toLowerCase().includes((value as string).toLowerCase()),
      },
      {
        title: "Start",
        dataIndex: "start_date",
        className: "no-break",
        sorter: (a: WarTableData, b: WarTableData) =>
          a.start_date.localeCompare(b.start_date),
      },
      {
        title: "End",
        dataIndex: "end_date",
        className: "no-break",
        defaultSortOrder: "descend",
        render: (date: string) => date || "---",
        sorter: (a: WarTableData, b: WarTableData) =>
          (a.end_date || "9999").localeCompare(b.end_date || "9999"),
      },
      {
        title: "Days",
        dataIndex: "days",
        render: (days) => formatInt(days),
        sorter: (a: WarTableData, b: WarTableData) => a.days - b.days,
      },
      {
        title: "Attackers",
        dataIndex: ["attackers", "original"],
        render: (original: string, x: WarTableData) => {
          const additional = x.attackers.members.length - 1;
          const elem =
            additional == 0 ? null : (
              <span style={{ display: "block" }}>{`+ ${additional}`}</span>
            );
          return (
            <>
              <FlagAvatar tag={original} name={x.attackers.original_name} />
              {elem}
            </>
          );
        },
        sorter: (a: WarTableData, b: WarTableData) =>
          a.attackers.members.length - b.attackers.members.length,
      },
      {
        title: "Defenders",
        dataIndex: ["defenders", "original"],
        render: (original: string, x: WarTableData) => {
          const additional = x.defenders.members.length - 1;
          const elem =
            additional == 0 ? null : (
              <span className="block">{`+ ${additional}`}</span>
            );
          return (
            <>
              <FlagAvatar tag={original} name={x.defenders.original_name} />
              {elem}
            </>
          );
        },
        sorter: (a: WarTableData, b: WarTableData) =>
          a.defenders.members.length - b.defenders.members.length,
      },
      {
        title: "Battles",
        dataIndex: "battles",
        className: "antd-column-separator",
        sorter: (a: WarTableData, b: WarTableData) => a.battles - b.battles,
      },
      {
        title: "Total Losses",
        className: "antd-column-separator",
        children: [
          {
            title: "Battle",
            dataIndex: "totalBattleLosses",
            render: (x) => formatInt(x),
            sorter: (a: WarTableData, b: WarTableData) =>
              a.totalBattleLosses - b.totalBattleLosses,
          },
          {
            title: "Attrition",
            dataIndex: "totalAttritionLosses",
            className: "antd-column-separator",
            render: (x) => formatInt(x),
            sorter: (a: WarTableData, b: WarTableData) =>
              a.totalAttritionLosses - b.totalAttritionLosses,
          },
        ],
      },
      {
        title: "Attacker Losses",
        className: "antd-column-separator",
        children: [
          {
            title: "Battle",
            dataIndex: ["attackers", "losses", "totalBattle"],
            render: (x) => formatInt(x),
            sorter: (a: WarTableData, b: WarTableData) =>
              a.attackers.losses.totalBattle - b.attackers.losses.totalBattle,
          },
          {
            title: "Attrition",
            dataIndex: ["attackers", "losses", "totalAttrition"],
            className: "antd-column-separator",
            render: (x) => formatInt(x),
            sorter: (a: WarTableData, b: WarTableData) =>
              a.attackers.losses.totalAttrition -
              b.attackers.losses.totalAttrition,
          },
        ],
      },
      {
        title: "Defender Losses",
        children: [
          {
            title: "Battle",
            dataIndex: ["defenders", "losses", "totalBattle"],
            render: (x) => formatInt(x),
            sorter: (a: WarTableData, b: WarTableData) =>
              a.defenders.losses.totalBattle - b.defenders.losses.totalBattle,
          },
          {
            title: "Attrition",
            dataIndex: ["defenders", "losses", "totalAttrition"],
            render: (x) => formatInt(x),
            sorter: (a: WarTableData, b: WarTableData) =>
              a.defenders.losses.totalAttrition -
              b.defenders.losses.totalAttrition,
          },
        ],
      },
    ];

  const expandable: ExpandableConfig<WarTableData> = {
    expandedRowRender: (record: WarTableData) => (
      <BattleView warName={record.name} />
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
      scroll={{ x: true }}
      dataSource={data}
      columns={columns}
      pagination={tablePagination}
      expandable={expandable}
    />
  );
};
