import { Card } from "@/components/Card";
import { CountryDetails } from "../../types/models";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { Flag } from "../../components/avatars";
import { DataTable } from "@/components/DataTable";
import { GameIconSprite, iconSpriteTitle } from "../../components/icons";
import { Tooltip } from "@/components/Tooltip";
import { cx } from "class-variance-authority";
import { LeaderStats } from "../../components/LeaderStats";
import { LandForceStrengthTooltip } from "../../components/LandForceStrengthTooltip";
import { NavalForceStrengthTooltip } from "../../components/NavalForceStrengthTooltip";
import { budgetSelect } from "./budget";

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
          className="justify-end"
          title="Current force strength"
          icon={<GameIconSprite src="infantry" alt="" />}
        />
      ),
      meta: { className: "text-right" },
      cell: (info) => <LandForceStrengthTooltip force={info.row.original} />,
    },
  ),

  columnHelper.accessor((x) => x.netManpower, {
    id: "manpower-reserves",
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        title="Net Manpower"
        className="justify-end"
        icon={<GameIconSprite src="manpower" alt="" />}
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
  }),

  columnHelper.accessor((x) => x.treasury - x.debt, {
    id: "net-cash",
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        icon={<GameIconSprite src="ducats" alt="" />}
        title={iconSpriteTitle.ducats}
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

  columnHelper.accessor((x) => budgetSelect.operatingProfit(x.budget), {
    id: "operating-profit",
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        icon={<GameIconSprite src="profit" alt="" />}
        title={iconSpriteTitle.profit}
      />
    ),
    meta: { className: "text-right" },
    cell: (info) => (
      <Tooltip>
        <Tooltip.Trigger>{formatInt(info.getValue())}</Tooltip.Trigger>
        <Tooltip.Content>
          <table>
            <caption className="text-lg">Last month budget</caption>

            <tbody>
              <tr>
                <td>Recurring revenue</td>
                <td className="pl-4 text-right">
                  {formatInt(
                    budgetSelect.recurringRevenue(info.row.original.budget),
                  )}
                </td>
              </tr>
              <tr>
                <td>Operating expenses</td>
                <td className="pl-4 text-right">
                  {formatInt(
                    budgetSelect.operatingExpenses(info.row.original.budget),
                  )}
                </td>
              </tr>
              <tr>
                <td>Operating profit</td>
                <td className="pl-4 text-right">
                  {formatInt(
                    budgetSelect.operatingProfit(info.row.original.budget),
                  )}
                </td>
              </tr>
              <tr>
                <td>Net profit</td>
                <td className="pl-4 text-right">
                  {formatInt(budgetSelect.netProfit(info.row.original.budget))}
                </td>
              </tr>
            </tbody>
          </table>
        </Tooltip.Content>
      </Tooltip>
    ),
  }),

  columnHelper.accessor("professionalism", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        icon={<GameIconSprite src="professionalism" alt="" />}
        title={iconSpriteTitle.professionalism}
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
        className="justify-end"
        icon={<GameIconSprite src="army_tradition" alt="" />}
        title={iconSpriteTitle.army_tradition}
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
          className="justify-end"
          icon={<GameIconSprite src="general" alt="" />}
          title="Best general (by pips)"
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
        className="justify-end"
        icon={<GameIconSprite src="war_exhaustion" alt="" />}
        title={iconSpriteTitle.war_exhaustion}
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
          className="justify-end"
          icon={<GameIconSprite src="heavy_ship" alt="" />}
          title="Ships"
        />
      ),
      meta: {
        className: "hidden text-right @lg:table-cell",
        headClassName: "hidden @lg:table-cell",
      },
      cell: (info) => <NavalForceStrengthTooltip forces={info.row.original} />,
    },
  ),

  columnHelper.accessor("milTech", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className="justify-end"
        icon={<GameIconSprite src="powers_military_tech" />}
        title={iconSpriteTitle.powers_military_tech}
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
  const totalReserves = data.map((x) => x.netManpower);
  const totalNetCash = data.map((x) => x.treasury - x.debt);
  const totalMonthlyProfit = data.map((x) =>
    budgetSelect.operatingProfit(x.budget),
  );
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
          <Table.Cell className="hidden text-right @lg:table-cell">
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
        className="justify-end"
        icon={<GameIconSprite src="infantry" alt="" />}
        title="Battles"
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
        className="justify-end"
        icon={<GameIconSprite src="infantry_skull" alt="" />}
        title="Total"
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
        className="justify-end"
        icon={<GameIconSprite src="heavy_ship" alt="" />}
        title="Ships Lost"
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
        className="justify-end"
        icon="🏅"
        title="Participation"
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
      className="max-h-96 max-w-xl grow @3xl/card:grow-0"
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
    <Card className="flex flex-col gap-4 p-6 @container/card">
      <div className="flex flex-col items-center">
        <p className="text-xl">{war.name}</p>
        <p>
          Started {years > 1 ? `${formatInt(years)} years and` : ``}{" "}
          {formatInt(leftDays)} days ago on {war.startDate}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-center text-lg">Combatants</p>
        <div className="flex w-full flex-col gap-8 @3xl/card:flex-row">
          <div className="grow @container">
            <ParticipantHealth participants={war.attackers} />
          </div>
          <div className="flex grow flex-col gap-1 @container">
            <ParticipantHealth participants={war.defenders} />
            <p className="text-right text-xs tracking-tight text-gray-400 @3xl:hidden">
              Additional columns hidden
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-center text-lg">Casualties</p>
        <div className="flex w-full flex-col gap-8 @3xl/card:flex-row">
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
