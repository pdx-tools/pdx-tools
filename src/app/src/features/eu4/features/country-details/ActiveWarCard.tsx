import { Card } from "@/components/Card";
import { CountryDetails } from "../../types/models";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { Flag } from "../../components/avatars";
import { DataTable } from "@/components/DataTable";
import {
  ArmyTraditionIcon,
  DucatsIcon,
  GeneralIcon,
  HeavyShipIcon,
  InfantryIcon,
  InfantrySkullIcon,
  ManpowerIcon,
  MilitaryTechIcon,
  ProfessionalismIcon,
  ProfitIcon,
  WarExhaustionIcon,
} from "../../components/icons";
import { Tooltip } from "@/components/Tooltip";
import { cx } from "class-variance-authority";
import { LeaderStats } from "../../components/LeaderStats";

type ActiveWar = CountryDetails["active_wars"][number];
type Participant = ActiveWar["attackers" | "defenders"][number];

const columnHelper = createColumnHelper<Participant>();
const activeColumns = [
  columnHelper.accessor("country.name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Country" />
    ),
    cell: ({ row }) => (
      <Flag
        size="xs"
        tag={row.original.country.tag}
        name={row.original.country.name}
      />
    ),
  }),

  columnHelper.accessor(
    (x) =>
      x.infantryUnits.strength +
      x.cavalryUnits.strength +
      x.artilleryUnits.strength +
      x.mercenaryUnits.strength,
    {
      id: "total-units",
      sortingFn: "basic",
      header: ({ column }) => (
        <Table.ColumnHeader
          column={column}
          title={
            <div className="flex grow justify-end">
              <InfantryIcon alt="Current force strength" />
            </div>
          }
        />
      ),
      meta: { className: "text-right" },
      cell: (info) => (
        <Tooltip>
          <Tooltip.Trigger>{formatInt(info.getValue())}K</Tooltip.Trigger>
          <Tooltip.Content className="flex flex-col p-2">
            <p>
              Infantry: {formatInt(info.row.original.infantryUnits.strength)}K
            </p>
            <p>
              Cavalry: {formatInt(info.row.original.cavalryUnits.strength)}K
            </p>
            <p>
              Artillery: {formatInt(info.row.original.artilleryUnits.strength)}K
            </p>
            <p>
              Mercenaries:{" "}
              {formatInt(info.row.original.mercenaryUnits.strength)}K
            </p>
          </Tooltip.Content>
        </Tooltip>
      ),
    },
  ),

  columnHelper.accessor(
    (x) =>
      x.manpower -
      (x.infantryUnits.count +
        x.cavalryUnits.count +
        x.artilleryUnits.count -
        x.infantryUnits.strength -
        x.cavalryUnits.strength -
        x.artilleryUnits.strength),
    {
      id: "manpower-reserves",
      sortingFn: "basic",
      header: ({ column }) => (
        <Table.ColumnHeader
          column={column}
          title={
            <div className="flex grow justify-end">
              <ManpowerIcon alt="Net Manpower" />
            </div>
          }
        />
      ),
      meta: { className: "text-right" },
      cell: (info) => (
        <Tooltip>
          <Tooltip.Trigger>{formatInt(info.getValue())}K</Tooltip.Trigger>
          <Tooltip.Content className="flex flex-col p-2">
            <p>Current manpower: {formatInt(info.row.original.manpower)}K</p>
            <p>
              Reinforcements:{" "}
              {formatInt(
                info.row.original.infantryUnits.count +
                  info.row.original.cavalryUnits.count +
                  info.row.original.artilleryUnits.count -
                  info.row.original.infantryUnits.strength -
                  info.row.original.cavalryUnits.strength -
                  info.row.original.artilleryUnits.strength,
              )}
              K
            </p>
          </Tooltip.Content>
        </Tooltip>
      ),
    },
  ),

  columnHelper.accessor((x) => x.treasury - x.debt, {
    id: "net-cash",
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={
          <div className="flex grow justify-end">
            <DucatsIcon />
          </div>
        }
      />
    ),
    meta: {
      className: "hidden text-right @lg:table-cell",
      headClassName: "hidden @lg:table-cell",
    },
    cell: (info) => (
      <Tooltip>
        <Tooltip.Trigger>{formatInt(info.getValue())}</Tooltip.Trigger>
        <Tooltip.Content className="flex flex-col p-2">
          <p>Treasury: {formatInt(info.row.original.treasury)}</p>
          <p>Debt: {formatInt(info.row.original.debt)}</p>
        </Tooltip.Content>
      </Tooltip>
    ),
  }),

  columnHelper.accessor("monthlyProfit", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={
          <div className="flex grow justify-end">
            <ProfitIcon />
          </div>
        }
      />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("professionalism", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={
          <div className="flex grow justify-end">
            <ProfessionalismIcon />
          </div>
        }
      />
    ),
    meta: {
      className: "hidden text-right @2xl:table-cell",
      headClassName: "hidden @2xl:table-cell",
    },
    cell: (info) => `${formatInt(info.getValue() * 100)}%`,
  }),

  columnHelper.accessor("armyTradition", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={
          <div className="flex grow justify-end">
            <ArmyTraditionIcon />
          </div>
        }
      />
    ),
    meta: {
      className: "hidden text-right @3xl:table-cell",
      headClassName: "hidden @3xl:table-cell",
    },
    cell: (info) => formatFloat(info.getValue(), 2),
  }),

  columnHelper.accessor(
    (x) =>
      (x.bestGeneral?.shock ?? 0) +
      (x.bestGeneral?.fire ?? 0) +
      (x.bestGeneral?.maneuver ?? 0) +
      (x.bestGeneral?.siege ?? 0),
    {
      id: "best-general",
      sortingFn: "basic",
      header: ({ column }) => (
        <Table.ColumnHeader
          column={column}
          title={
            <div className="flex grow justify-end">
              <GeneralIcon alt="Best general (by pips)" />
            </div>
          }
        />
      ),
      meta: {
        className: "hidden text-right @3xl:table-cell",
        headClassName: "hidden @3xl:table-cell",
      },
      cell: (info) =>
        info.row.original.bestGeneral ? (
          <Tooltip>
            <Tooltip.Trigger className="text-xs">
              <LeaderStats
                showParentheses={false}
                {...info.row.original.bestGeneral}
              />
            </Tooltip.Trigger>
            <Tooltip.Content className="flex gap-1">
              <span>{info.row.original.bestGeneral.name}</span>{" "}
              <LeaderStats {...info.row.original.bestGeneral} />
            </Tooltip.Content>
          </Tooltip>
        ) : null,
    },
  ),

  columnHelper.accessor("warExhaustion", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={
          <div className="flex grow justify-end">
            <WarExhaustionIcon />
          </div>
        }
      />
    ),
    meta: {
      className: "hidden text-right @xl:table-cell",
      headClassName: "hidden @xl:table-cell",
    },
    cell: (info) => formatFloat(info.getValue(), 2),
  }),

  columnHelper.accessor(
    (x) =>
      x.heavyShipUnits + x.lightShipUnits + x.galleyUnits + x.transportUnits,
    {
      id: "ships",
      sortingFn: "basic",
      header: ({ column }) => (
        <Table.ColumnHeader
          column={column}
          title={
            <div className="flex grow justify-end">
              <HeavyShipIcon alt="Ships" />
            </div>
          }
        />
      ),
      meta: {
        className: "hidden text-right @lg:table-cell",
        headClassName: "hidden @lg:table-cell",
      },
      cell: (info) => (
        <Tooltip>
          <Tooltip.Trigger>{formatInt(info.getValue())}</Tooltip.Trigger>
          <Tooltip.Content className="flex flex-col p-2">
            <p>Heavy: {formatInt(info.row.original.heavyShipUnits)}</p>
            <p>Light: {formatInt(info.row.original.lightShipUnits)}</p>
            <p>Galley: {formatInt(info.row.original.galleyUnits)}</p>
            <p>Transports: {formatInt(info.row.original.transportUnits)}</p>
          </Tooltip.Content>
        </Tooltip>
      ),
    },
  ),

  columnHelper.accessor("milTech", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={
          <div className="flex grow justify-end">
            <MilitaryTechIcon />
          </div>
        }
      />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

function ParticipantHealth({ participants }: { participants: Participant[] }) {
  const data = participants.filter((x) => !x.exited);
  const totalUnits = data.map(
    (x) =>
      x.infantryUnits.strength +
      x.cavalryUnits.strength +
      x.artilleryUnits.strength +
      x.mercenaryUnits.strength,
  );
  const totalReserves = data.map(
    (x) =>
      x.manpower -
      (x.infantryUnits.count +
        x.cavalryUnits.count +
        x.artilleryUnits.count -
        x.infantryUnits.strength -
        x.cavalryUnits.strength -
        x.artilleryUnits.strength),
  );
  const totalNetCash = data.map((x) => x.treasury - x.debt);
  const totalMonthlyProfit = data.map((x) => x.monthlyProfit);
  return (
    <DataTable
      size="compact"
      className="max-h-96"
      columns={activeColumns}
      data={data}
      summary={
        <Table.Row className="pt-1">
          <Table.Cell>Total</Table.Cell>
          <Table.Cell className="text-right">
            {formatInt(totalUnits.reduce((acc, x) => acc + x, 0))}K
          </Table.Cell>
          <Table.Cell className="text-right">
            {formatInt(totalReserves.reduce((acc, x) => acc + x, 0))}K
          </Table.Cell>
          <Table.Cell className="text-right">
            {formatInt(totalNetCash.reduce((acc, x) => acc + x, 0))}
          </Table.Cell>
          <Table.Cell className="text-right">
            {formatInt(totalMonthlyProfit.reduce((acc, x) => acc + x, 0))}
          </Table.Cell>
        </Table.Row>
      }
    />
  );
}

const totalColumns = [
  columnHelper.accessor("country.name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Country" />
    ),
    cell: ({ row }) => (
      <Flag tag={row.original.country.tag} name={row.original.country.name}>
        <Tooltip>
          <Tooltip.Trigger asChild>
            <Flag.DrawerTrigger
              className={cx(
                "gap-x-2 pr-1",
                row.original.exited && "contrast-50",
              )}
            >
              <Flag.Image size="xs" />
              <Flag.CountryName />
            </Flag.DrawerTrigger>
          </Tooltip.Trigger>
          <Tooltip.Content side="right">
            {row.original.exited
              ? `Peaced out: ${row.original.exited}`
              : row.original.country.tag}
          </Tooltip.Content>
        </Tooltip>
      </Flag>
    ),
  }),

  columnHelper.accessor("losses.landTotalBattle", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={
          <div className="flex grow justify-end">
            <InfantryIcon alt="Battles" />
          </div>
        }
      />
    ),
    meta: { className: "text-right" },
    cell: (info) => `${formatInt(info.getValue() / 1000)}K`,
  }),

  columnHelper.accessor("losses.landTotal", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={
          <div className="flex grow justify-end">
            <InfantrySkullIcon alt="Total" />
          </div>
        }
      />
    ),
    meta: { className: "text-right" },
    cell: (info) => `${formatInt(info.getValue() / 1000)}K`,
  }),

  columnHelper.accessor("losses.navyTotal", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={
          <div className="flex grow justify-end">
            <HeavyShipIcon alt="Ships Lost" />
          </div>
        }
      />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("participationPercent", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title={
          <Tooltip>
            <Tooltip.Trigger className="flex grow justify-end">
              🏅
            </Tooltip.Trigger>
            <Tooltip.Content>Participation</Tooltip.Content>
          </Tooltip>
        }
      />
    ),
    meta: { className: "text-right" },
    cell: (info) => (
      <Tooltip>
        <Tooltip.Trigger>{formatInt(info.getValue() * 100)}%</Tooltip.Trigger>
        <Tooltip.Content>
          {formatInt(info.row.original.participation)}
        </Tooltip.Content>
      </Tooltip>
    ),
  }),
];

function SideLosses({ participants }: { participants: Participant[] }) {
  const battleTotal = participants.map((x) => x.losses.landTotalBattle);
  const totalTotal = participants.map((x) => x.losses.landTotal);
  const shipTotal = participants.map((x) => x.losses.navyTotal);

  return (
    <DataTable
      size="compact"
      className="max-h-96 grow max-w-xl @3xl/card:grow-0"
      columns={totalColumns}
      data={participants}
      summary={
        <Table.Row className="pt-1">
          <Table.Cell>Total</Table.Cell>
          <Table.Cell className="text-right">
            {formatInt(battleTotal.reduce((acc, x) => acc + x, 0) / 1000)}K
          </Table.Cell>
          <Table.Cell className="text-right">
            {formatInt(totalTotal.reduce((acc, x) => acc + x, 0) / 1000)}K
          </Table.Cell>
          <Table.Cell className="text-right">
            {formatInt(shipTotal.reduce((acc, x) => acc + x, 0))}
          </Table.Cell>
        </Table.Row>
      }
    />
  );
}

export const ActiveWarCard = ({
  war,
}: {
  war: CountryDetails["active_wars"][number];
}) => {
  const years = war.days / 365;
  const leftDays = war.days % 365;
  return (
    <Card className="p-6 flex flex-col gap-4 @container/card">
      <div className="flex flex-col items-center">
        <p className="text-xl">{war.name}</p>
        <p>
          Started {years > 1 ? `${formatInt(years)} years and` : ``}{" "}
          {formatInt(leftDays)} days ago on {war.startDate}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-lg text-center">Combatants</p>
        <div className="flex flex-col @3xl/card:flex-row gap-8 w-full">
          <div className="@container  grow">
            <ParticipantHealth participants={war.attackers} />
          </div>
          <div className="@container flex flex-col gap-1 grow">
            <ParticipantHealth participants={war.defenders} />
            <p className="@3xl:hidden text-gray-400 text-right text-xs tracking-tight">
              Additional columns hidden
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-lg text-center">Casualties</p>
        <div className="flex flex-col @3xl/card:flex-row gap-8 w-full">
          <div className="flex grow @3xl/card:justify-end">
            <SideLosses participants={war.attackers} />
          </div>
          <div className="flex grow">
            <SideLosses participants={war.defenders} />
          </div>
        </div>
      </div>
    </Card>
  );
};
