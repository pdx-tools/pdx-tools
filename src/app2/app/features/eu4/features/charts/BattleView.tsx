import React, { useCallback } from "react";
import { Losses } from "../../types/models";
import { formatFloat, formatInt } from "@/lib/format";
import { Flag } from "@/features/eu4/components/avatars";
import { useEu4Worker } from "@/features/eu4/worker";
import { BattleInfo, WarParticipant } from "../../worker/module";
import { Tooltip } from "@/components/Tooltip";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { Divider } from "@/components/Divider";

interface BattleViewProps {
  warName: string;
}

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

const NumberCell = ({ children }: { children: number }) => (
  <Table.Cell className="text-right">{formatInt(children)}</Table.Cell>
);

const ParticipantsSummary = ({
  participants,
}: {
  participants: WarParticipant[];
}) => {
  const fieldSum = (k: keyof Losses) =>
    participants.reduce((acc, x) => acc + x.losses[k], 0);

  return (
    <Table.Row>
      <Table.Cell colSpan={4}>Total</Table.Cell>
      <NumberCell>{fieldSum("infantryBattle")}</NumberCell>
      <NumberCell>{fieldSum("cavalryBattle")}</NumberCell>
      <NumberCell>{fieldSum("artilleryBattle")}</NumberCell>
      <NumberCell>{fieldSum("heavyShipBattle")}</NumberCell>
      <NumberCell>{fieldSum("lightShipBattle")}</NumberCell>
      <NumberCell>{fieldSum("galleyShipBattle")}</NumberCell>
      <NumberCell>{fieldSum("transportShipBattle")}</NumberCell>
      <NumberCell>{fieldSum("totalBattle")}</NumberCell>
      <NumberCell>{fieldSum("infantryAttrition")}</NumberCell>
      <NumberCell>{fieldSum("cavalryAttrition")}</NumberCell>
      <NumberCell>{fieldSum("artilleryAttrition")}</NumberCell>
      <NumberCell>{fieldSum("heavyShipAttrition")}</NumberCell>
      <NumberCell>{fieldSum("lightShipAttrition")}</NumberCell>
      <NumberCell>{fieldSum("galleyShipAttrition")}</NumberCell>
      <NumberCell>{fieldSum("transportShipAttrition")}</NumberCell>
      <NumberCell>{fieldSum("totalAttrition")}</NumberCell>
    </Table.Row>
  );
};

const columnHelper = createColumnHelper<WarParticipant>();

const participantColumns = [
  columnHelper.accessor("country.name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Country" />
    ),
    cell: ({ row }) => (
      <Flag tag={row.original.country.tag} name={row.original.country.name} />
    ),
  }),

  columnHelper.accessor("participation", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Participation" />
    ),
    meta: { className: "text-right" },
    cell: ({ row }) => (
      <Tooltip>
        <Tooltip.Trigger>
          {formatInt(row.original.participationPercent * 100)}%
        </Tooltip.Trigger>
        <Tooltip.Content>
          {formatFloat(row.original.participation)}
        </Tooltip.Content>
      </Tooltip>
    ),
  }),

  columnHelper.accessor("joined", {
    sortingFn: "alphanumeric",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Joined" />
    ),
    meta: { className: "text-right no-break" },
    cell: (info) => info.getValue() ?? "---",
  }),

  columnHelper.accessor("exited", {
    sortingFn: "alphanumeric",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Exited" />
    ),
    meta: { className: "text-right no-break" },
    cell: (info) => info.getValue() ?? "---",
  }),

  columnHelper.group({
    header: "Battle Casualties",
    columns: unitTypes.map(([title, column, _c]) =>
      columnHelper.accessor(`losses.${column}`, {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title={title} />
        ),
        meta: { className: "text-right no-break" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ),
  }),

  columnHelper.group({
    header: "Attrition Casualties",
    columns: unitTypes.map(([title, _c, column]) =>
      columnHelper.accessor(`losses.${column}`, {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title={title} />
        ),
        meta: { className: "text-right no-break" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ),
  }),
];

const battleColumnHelper = createColumnHelper<BattleInfo>();
const landColumns = [
  battleColumnHelper.accessor("date", {
    sortingFn: "alphanumeric",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Date" />,
    meta: { className: "text-right no-break" },
    cell: (info) => info.getValue() ?? "---",
  }),

  battleColumnHelper.accessor("name", {
    sortingFn: "text",
    header: "Location",
  }),

  battleColumnHelper.accessor("attacker", {
    header: "Attacker",
    cell: (info) => (
      <div
        className={
          info.row.original.attackerWon
            ? "flex bg-green-300 dark:bg-green-700"
            : ""
        }
      >
        <Flag
          tag={info.getValue().country.tag}
          name={info.getValue().country.name}
        />
      </div>
    ),
  }),

  battleColumnHelper.accessor("defender", {
    header: "Defender",
    cell: (info) => (
      <div
        className={
          !info.row.original.attackerWon
            ? "flex bg-green-300 dark:bg-green-700"
            : ""
        }
      >
        <Flag
          tag={info.getValue().country.tag}
          name={info.getValue().country.name}
        />
      </div>
    ),
  }),

  battleColumnHelper.accessor("forces", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Forces" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  battleColumnHelper.accessor("losses", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Losses" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  battleColumnHelper.group({
    header: "Attacker",
    columns: [
      battleColumnHelper.accessor("attacker.commander", {
        header: "Commander",
        cell: ({ row }) =>
          !row.original.attacker.commander ? (
            "---"
          ) : (
            <Tooltip>
              <Tooltip.Trigger>
                {row.original.attacker.commander_stats}
              </Tooltip.Trigger>
              <Tooltip.Content>
                {row.original.attacker.commander}
              </Tooltip.Content>
            </Tooltip>
          ),
      }),

      battleColumnHelper.accessor("attacker.infantry", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Inf" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("attacker.cavalry", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Cav" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("attacker.artillery", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Art" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("attacker.losses", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Losses" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ],
  }),

  battleColumnHelper.group({
    header: "Defender",
    columns: [
      battleColumnHelper.accessor("defender.commander", {
        header: "Commander",
        cell: ({ row }) =>
          !row.original.defender.commander ? (
            "---"
          ) : (
            <Tooltip>
              <Tooltip.Trigger>
                {row.original.defender.commander_stats}
              </Tooltip.Trigger>
              <Tooltip.Content>
                {row.original.defender.commander}
              </Tooltip.Content>
            </Tooltip>
          ),
      }),

      battleColumnHelper.accessor("defender.infantry", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Inf" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("defender.cavalry", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Cav" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("defender.artillery", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Art" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("defender.losses", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Losses" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ],
  }),
];

const navyColumns = [
  battleColumnHelper.accessor("date", {
    sortingFn: "alphanumeric",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Date" />,
    meta: { className: "text-right no-break" },
    cell: (info) => info.getValue() ?? "---",
  }),

  battleColumnHelper.accessor("name", {
    sortingFn: "text",
    header: "Location",
  }),

  battleColumnHelper.accessor("attacker", {
    header: "Attacker",
    cell: (info) => (
      <div
        className={
          info.row.original.attackerWon
            ? "flex bg-green-300 dark:bg-green-700"
            : ""
        }
      >
        <Flag
          tag={info.getValue().country.tag}
          name={info.getValue().country.name}
        />
      </div>
    ),
  }),

  battleColumnHelper.accessor("defender", {
    header: "Defender",
    cell: (info) => (
      <div
        className={
          !info.row.original.attackerWon
            ? "flex bg-green-300 dark:bg-green-700"
            : ""
        }
      >
        <Flag
          tag={info.getValue().country.tag}
          name={info.getValue().country.name}
        />
      </div>
    ),
  }),

  battleColumnHelper.accessor("forces", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Forces" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  battleColumnHelper.accessor("losses", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Losses" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  battleColumnHelper.group({
    header: "Attacker",
    columns: [
      battleColumnHelper.accessor("attacker.commander", {
        header: "Commander",
        cell: ({ row }) =>
          !row.original.attacker.commander ? (
            "---"
          ) : (
            <Tooltip>
              <Tooltip.Trigger>
                {row.original.attacker.commander_stats}
              </Tooltip.Trigger>
              <Tooltip.Content>
                {row.original.attacker.commander}
              </Tooltip.Content>
            </Tooltip>
          ),
      }),

      battleColumnHelper.accessor("attacker.heavy_ship", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Heavy" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("attacker.light_ship", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Light" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("attacker.galley", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Galley" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("attacker.transport", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Trnspt" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("attacker.losses", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Losses" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ],
  }),

  battleColumnHelper.group({
    header: "Defender",
    columns: [
      battleColumnHelper.accessor("defender.commander", {
        header: "Commander",
        cell: ({ row }) =>
          !row.original.defender.commander ? (
            "---"
          ) : (
            <Tooltip>
              <Tooltip.Trigger>
                {row.original.defender.commander_stats}
              </Tooltip.Trigger>
              <Tooltip.Content>
                {row.original.defender.commander}
              </Tooltip.Content>
            </Tooltip>
          ),
      }),

      battleColumnHelper.accessor("defender.heavy_ship", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Heavy" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("defender.light_ship", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Light" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("defender.galley", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Galley" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("defender.transport", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Trnspt" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),

      battleColumnHelper.accessor("defender.losses", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Losses" />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
    ],
  }),
];

export const BattleView = ({ warName }: BattleViewProps) => {
  const { data } = useEu4Worker(
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

        return {
          attackers: war.attackerParticipants,
          defenders: war.defenderParticipants,
          navalBattles: navalBattleInfos,
          landBattles: landBattleInfos,
        };
      },
      [warName],
    ),
  );

  return (
    <div className="grid grid-cols-1 gap-12">
      <div>
        <Divider>Attackers</Divider>

        <DataTable
          initialSorting={[{ id: "participation", desc: true }]}
          data={data?.attackers ?? []}
          columns={participantColumns}
          summary={<ParticipantsSummary participants={data?.attackers ?? []} />}
        />
      </div>

      <div>
        <Divider>Defenders</Divider>
        <DataTable
          initialSorting={[{ id: "participation", desc: true }]}
          data={data?.defenders ?? []}
          columns={participantColumns}
          summary={<ParticipantsSummary participants={data?.defenders ?? []} />}
        />
      </div>

      <div>
        <Divider>Land Battles</Divider>
        <DataTable data={data?.landBattles ?? []} columns={landColumns} />
      </div>

      <div>
        <Divider>Naval Battles</Divider>
        <DataTable data={data?.navalBattles ?? []} columns={navyColumns} />
      </div>
    </div>
  );
};
