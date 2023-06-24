import React, { useCallback, useRef } from "react";
import { Table, Tooltip } from "antd";
import { ColumnGroupType, ColumnType } from "antd/lib/table";
import { useIsLoading } from "@/components/viz/visualization-context";
import { Losses } from "../../types/models";
import { formatInt } from "@/lib/format";
import { FlagAvatar } from "@/features/eu4/components/avatars";
import { useEu4Worker } from "@/features/eu4/worker";
import { BattleInfo, WarParticipant } from "../../worker/module";

interface BattleViewProps {
  warName: string;
}

const winnerStyle = {
  backgroundColor: "#b7eb8f",
};

const unitTypes: [string, keyof Losses, keyof Losses][] = [
  ["Inf", "infantryBattle", "infantryAttrition"],
  ["Cav", "cavalryBattle", "cavalryAttrition"],
  ["Art", "artilleryBattle", "artilleryAttrition"],
  ["Heavy", "heavyShipBattle", "heavyShipAttrition"],
  ["Light", "lightShipBattle", "lightShipAttrition"],
  ["Galley", "galleyShipBattle", "galleyShipAttrition"],
  ["Trnspt", "transportShipBattle", "transportShipAttrition"],
  ["Total", "totalBattle", "totalAttrition"],
];

function createSideSummary(participants: WarParticipant[]) {
  const summaries: JSX.Element[] = Array(unitTypes.length * 2).fill(<></>);
  for (const [i, unitType] of unitTypes.entries()) {
    const [_title, battle, attrition] = unitType;
    let battleTotal = 0;
    let attritionTotal = 0;
    for (const participant of participants) {
      battleTotal += participant.losses[battle];
      attritionTotal += participant.losses[attrition];
    }

    summaries[i] = (
      <Table.Summary.Cell key={4 + i} index={4 + i} align="right">
        {formatInt(battleTotal)}
      </Table.Summary.Cell>
    );
    summaries[i + unitTypes.length] = (
      <Table.Summary.Cell key={12 + i} index={12 + i} align="right">
        {formatInt(attritionTotal)}
      </Table.Summary.Cell>
    );
  }

  return () => (
    <Table.Summary.Row>
      <Table.Summary.Cell key="total-label" index={0} colSpan={4}>
        Total
      </Table.Summary.Cell>
      {summaries}
    </Table.Summary.Row>
  );
}

function createSideColumn(): (
  | ColumnGroupType<WarParticipant>
  | ColumnType<WarParticipant>
)[] {
  const battleColumns: ColumnType<WarParticipant>[] = unitTypes.map(
    ([title, column, _c]) => ({
      title,
      align: "right",
      dataIndex: ["losses", column],
      render: (x: number) => formatInt(x),
      className: column == "totalBattle" ? "antd-column-separator" : "",
      sorter: (a: WarParticipant, b: WarParticipant) =>
        a.losses[column] - b.losses[column],
    })
  );

  const attritionColumns: ColumnType<WarParticipant>[] = unitTypes.map(
    ([title, _c, column]) => ({
      title,
      align: "right",
      dataIndex: ["losses", column],
      render: (x: number) => formatInt(x),
      sorter: (a: WarParticipant, b: WarParticipant) =>
        a.losses[column] - b.losses[column],
    })
  );

  return [
    {
      title: "Country",
      dataIndex: ["name"],
      render: (_name: string, x: WarParticipant) => (
        <FlagAvatar tag={x.tag} name={x.name} />
      ),
      sorter: (a: WarParticipant, b: WarParticipant) =>
        a.name.localeCompare(b.name),
    },
    {
      title: "Participation",
      dataIndex: "participation",
      render: (_name: string, x: WarParticipant) => (
        <Tooltip title={x.participation}>{`${formatInt(
          x.participation_percent * 100
        )}%`}</Tooltip>
      ),
      sorter: (a: WarParticipant, b: WarParticipant) =>
        a.participation - b.participation,
    },
    {
      title: "Joined",
      dataIndex: "joined",
      className: "no-break",
      render: (date: string) => date || "---",
    },
    {
      title: "Exited",
      dataIndex: "exited",
      className: "antd-column-separator no-break",
      render: (date: string) => date || "---",
    },
    {
      title: "Battle Casualties",
      className: "antd-column-separator",
      children: battleColumns,
    },
    {
      title: "Attrition Casualties",
      children: attritionColumns,
    },
  ];
}

export const BattleView = ({ warName }: BattleViewProps) => {
  const isLoading = useIsLoading();

  // These are references instead of state as setState functions
  // were weirdly expensive like calling setStates on an 8 year old
  // ultrabook would take a full second. Perhaps this is due to next.js
  // debug (ie: hot module reload) shenaningans
  const navalBattles = useRef<BattleInfo[]>([]);
  const landBattles = useRef<BattleInfo[]>([]);
  const attackers = useRef<WarParticipant[]>([]);
  const defenders = useRef<WarParticipant[]>([]);

  useEu4Worker(
    useCallback(
      async (worker) => {
        const war = await worker.eu4GetWarInfo(warName);
        const battles = war.battles;
        const navalBattleInfos: BattleInfo[] = [];
        const landBattleInfos: BattleInfo[] = [];
        for (const battle of battles) {
          if (
            battle.attacker.infantry +
              battle.attacker.cavalry +
              battle.attacker.artillery ===
            0
          ) {
            navalBattleInfos.push(battle);
          } else {
            landBattleInfos.push(battle);
          }
        }

        attackers.current = war.attacker_participants;
        defenders.current = war.defender_participants;
        navalBattles.current = navalBattleInfos;
        landBattles.current = landBattleInfos;
      },
      [warName]
    )
  );

  const navalColumns: (ColumnGroupType<BattleInfo> | ColumnType<BattleInfo>)[] =
    [
      {
        title: "Date",
        dataIndex: "date",
        className: "no-break",
        sorter: (a: BattleInfo, b: BattleInfo) => a.date.localeCompare(b.date),
      },
      {
        title: "Location",
        dataIndex: "name",
        className: "no-break",
        render: (_x: string, record: BattleInfo) =>
          `${record.name} (${record.location})`,
      },
      {
        title: "Attacker",
        dataIndex: ["attacker", "country"],
        render: (_name: string, x: BattleInfo) => (
          <FlagAvatar tag={x.attacker.country} name={x.attacker.country_name} />
        ),
        onCell: (record: BattleInfo) => ({
          record,
          style: record.attacker_won ? winnerStyle : undefined,
        }),
        sorter: (a: BattleInfo, b: BattleInfo) =>
          a.attacker.country.localeCompare(b.attacker.country),
      },
      {
        title: "Defender",
        dataIndex: ["defender", "country"],
        render: (_name: string, x: BattleInfo) => (
          <FlagAvatar tag={x.defender.country} name={x.defender.country_name} />
        ),
        onCell: (record: BattleInfo) => ({
          record,
          style: !record.attacker_won ? winnerStyle : undefined,
        }),
        sorter: (a: BattleInfo, b: BattleInfo) =>
          a.defender.country.localeCompare(b.defender.country),
      },
      {
        title: "Forces",
        align: "right",
        dataIndex: "forces",
        render: (x: number) => formatInt(x),
        sorter: (a: BattleInfo, b: BattleInfo) => a.forces - b.forces,
      },
      {
        title: "Losses",
        align: "right",
        dataIndex: "losses",
        className: "antd-column-separator",
        render: (x: number) => formatInt(x),
        sorter: (a: BattleInfo, b: BattleInfo) => a.losses - b.losses,
      },
      {
        title: "Attacker",
        children: [
          {
            title: "Commander",
            dataIndex: ["attacker", "commander"],
            render: (commander: string | null, x: BattleInfo) =>
              !commander ? (
                "---"
              ) : (
                <Tooltip title={commander}>
                  {x.attacker.commander_stats}
                </Tooltip>
              ),
          },
          {
            title: "Heavy",
            align: "right",
            dataIndex: ["attacker", "heavy_ship"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              a.attacker.heavy_ship - b.attacker.heavy_ship,
          },
          {
            title: "Light",
            align: "right",
            dataIndex: ["attacker", "light_ship"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              a.attacker.light_ship - b.attacker.light_ship,
          },
          {
            title: "Galley",
            align: "right",
            dataIndex: ["attacker", "galley"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              a.attacker.galley - b.attacker.galley,
          },
          {
            title: "Trnspt",
            align: "right",
            dataIndex: ["attacker", "transport"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              a.attacker.transport - b.attacker.transport,
          },
          {
            title: "Losses",
            align: "right",
            dataIndex: ["attacker", "losses"],
            className: "antd-column-separator",
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              (a.attacker.losses || 0) - (b.attacker.losses || 0),
          },
        ],
      },
      {
        title: "Defender",
        children: [
          {
            title: "Commander",
            align: "right",
            dataIndex: ["defender", "commander"],
            render: (commander: string | null, x: BattleInfo) =>
              !commander ? (
                "---"
              ) : (
                <Tooltip title={commander}>
                  {x.defender.commander_stats}
                </Tooltip>
              ),
          },
          {
            title: "Heavy",
            align: "right",
            dataIndex: ["defender", "heavy_ship"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              (a.defender.heavy_ship || 0) - (b.defender.heavy_ship || 0),
          },
          {
            title: "Light",
            align: "right",
            dataIndex: ["defender", "light_ship"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              (a.defender.light_ship || 0) - (b.defender.light_ship || 0),
          },
          {
            title: "Galley",
            align: "right",
            dataIndex: ["defender", "galley"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              (a.defender.galley || 0) - (b.defender.galley || 0),
          },
          {
            title: "Trnspt",
            align: "right",
            dataIndex: ["defender", "transport"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              (a.defender.transport || 0) - (b.defender.transport || 0),
          },
          {
            title: "Losses",
            align: "right",
            dataIndex: ["defender", "losses"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              (a.defender.losses || 0) - (b.defender.losses || 0),
          },
        ],
      },
    ];

  const landColumns: (ColumnGroupType<BattleInfo> | ColumnType<BattleInfo>)[] =
    [
      {
        title: "Date",
        dataIndex: "date",
        className: "no-break",
        sorter: (a: BattleInfo, b: BattleInfo) => a.date.localeCompare(b.date),
      },
      {
        title: "Location",
        dataIndex: "name",
        className: "no-break",
        render: (_x: string, record: BattleInfo) =>
          `${record.name} (${record.location})`,
      },
      {
        title: "Attacker",
        dataIndex: ["attacker", "country"],
        render: (_name: string, x: BattleInfo) => (
          <FlagAvatar tag={x.attacker.country} name={x.attacker.country_name} />
        ),
        onCell: (record: BattleInfo) => ({
          record,
          style: record.attacker_won ? winnerStyle : undefined,
        }),
        sorter: (a: BattleInfo, b: BattleInfo) =>
          a.attacker.country.localeCompare(b.attacker.country),
      },
      {
        title: "Defender",
        dataIndex: ["defender", "country"],
        render: (_name: string, x: BattleInfo) => (
          <FlagAvatar tag={x.defender.country} name={x.defender.country_name} />
        ),
        onCell: (record: BattleInfo) => ({
          record,
          style: !record.attacker_won ? winnerStyle : undefined,
        }),
        sorter: (a: BattleInfo, b: BattleInfo) =>
          a.defender.country.localeCompare(b.defender.country),
      },
      {
        title: "Forces",
        align: "right",
        dataIndex: "forces",
        render: (x: number) => formatInt(x),
        sorter: (a: BattleInfo, b: BattleInfo) => a.forces - b.forces,
      },
      {
        title: "Losses",
        align: "right",
        dataIndex: "losses",
        className: "antd-column-separator",
        render: (x: number) => formatInt(x),
        sorter: (a: BattleInfo, b: BattleInfo) => a.losses - b.losses,
      },
      {
        title: "Attacker",
        className: "antd-column-separator",
        children: [
          {
            title: "Commander",
            dataIndex: ["attacker", "commander"],
            render: (commander: string | null, x: BattleInfo) =>
              !commander ? (
                "---"
              ) : (
                <Tooltip title={commander}>
                  {x.attacker.commander_stats}
                </Tooltip>
              ),
          },
          {
            title: "Inf",
            align: "right",
            dataIndex: ["attacker", "infantry"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              (a.attacker.infantry || 0) - (b.attacker.infantry || 0),
          },
          {
            title: "Cav",
            align: "right",
            dataIndex: ["attacker", "cavalry"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              (a.attacker.cavalry || 0) - (b.attacker.cavalry || 0),
          },
          {
            title: "Art",
            align: "right",
            dataIndex: ["attacker", "artillery"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              a.attacker.artillery - b.attacker.artillery,
          },
          {
            title: "Losses",
            align: "right",
            dataIndex: ["attacker", "losses"],
            render: (x: number) => formatInt(x),
            className: "antd-column-separator",
            sorter: (a: BattleInfo, b: BattleInfo) =>
              a.attacker.losses - b.attacker.losses,
          },
        ],
      },
      {
        title: "Defender",
        children: [
          {
            title: "Commander",
            dataIndex: ["defender", "commander"],
            render: (commander: string | null, x: BattleInfo) =>
              !commander ? (
                "---"
              ) : (
                <Tooltip title={commander}>
                  {x.defender.commander_stats}
                </Tooltip>
              ),
          },
          {
            title: "Inf",
            align: "right",
            dataIndex: ["defender", "infantry"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              a.defender.infantry - b.defender.infantry,
          },
          {
            title: "Cav",
            align: "right",
            dataIndex: ["defender", "cavalry"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              a.defender.cavalry - b.defender.cavalry,
          },
          {
            title: "Art",
            align: "right",
            dataIndex: ["defender", "artillery"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              a.defender.artillery - b.defender.artillery,
          },
          {
            title: "Losses",
            align: "right",
            dataIndex: ["defender", "losses"],
            render: (x: number) => formatInt(x),
            sorter: (a: BattleInfo, b: BattleInfo) =>
              a.defender.losses - b.defender.losses,
          },
        ],
      },
    ];

  return (
    <div className="grid grid-cols-1 gap-12">
      <Table
        size="small"
        title={() => "Attackers"}
        rowKey="name"
        loading={isLoading}
        pagination={false}
        scroll={{ x: true }}
        dataSource={attackers.current}
        columns={createSideColumn()}
        summary={createSideSummary(attackers.current)}
      />
      <Table
        size="small"
        title={() => "Defenders"}
        rowKey="name"
        loading={isLoading}
        pagination={false}
        scroll={{ x: true }}
        dataSource={defenders.current}
        columns={createSideColumn()}
        summary={createSideSummary(defenders.current)}
      />
      <Table
        size="small"
        title={() => "Land Battles"}
        rowKey={(record) => `${record.date} - ${record.location}`}
        loading={isLoading}
        pagination={false}
        scroll={{ x: true }}
        dataSource={landBattles.current}
        columns={landColumns}
      />
      <Table
        size="small"
        title={() => "Naval Battles"}
        rowKey={(record) => `${record.date} - ${record.location}`}
        loading={isLoading}
        pagination={false}
        scroll={{ x: true }}
        dataSource={navalBattles.current}
        columns={navalColumns}
      />
    </div>
  );
};
