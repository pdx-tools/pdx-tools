import { ProfileOutlined } from "@ant-design/icons";
import { useEu4Worker } from "../../worker";
import { CountryDetails, Eu4Date } from "../../types/models";
import { FlagAvatar } from "../../components/avatars";
import { useCallback, useState } from "react";
import {
  AdminManaIcon,
  ArtilleryIcon,
  AutonomyDevelopmentIcon,
  CavalryIcon,
  DevelopmentIcon,
  DiplomaticManaIcon,
  GoldIcon,
  InfantryIcon,
  ManpowerIcon,
  MercenaryIcon,
  MilitaryManaIcon,
} from "../../components/icons";
import { formatInt } from "@/lib/format";
import { useEu4Meta, useSaveFilenameWith } from "../../store";
import { downloadData } from "@/lib/downloadData";
import { createCsv } from "@/lib/csv";
import { IconButton } from "@/components/IconButton";
import { Alert } from "@/components/Alert";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";

type MonitorRow = CountryDetails & { date: Eu4Date; rowSpan: number };

const columnHelper = createColumnHelper<MonitorRow>();
const columns = [
  columnHelper.accessor("date", {
    header: "Date",
    meta: { className: "no-break" },
  }),

  columnHelper.accessor("tag", {
    header: "Tag",
    cell: ({ row }) => (
      <FlagAvatar
        tag={row.original.tag}
        name={row.original.name}
        size="small"
      />
    ),
  }),

  columnHelper.accessor((x) => x.treasury - x.loans, {
    id: "balance",
    header: () => <GoldIcon />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("raw_development", {
    header: () => <DevelopmentIcon />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("development", {
    header: () => <AutonomyDevelopmentIcon />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("adm_mana", {
    header: () => <AdminManaIcon />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("dip_mana", {
    header: () => <DiplomaticManaIcon />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("mil_mana", {
    header: () => <MilitaryManaIcon />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("manpower", {
    header: () => <ManpowerIcon />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()) + "K",
  }),

  columnHelper.accessor("infantry_units.count", {
    header: () => <InfantryIcon />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("cavalry_units.count", {
    header: () => <CavalryIcon />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("artillery_units.count", {
    header: () => <ArtilleryIcon />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.accessor("mercenary_units", {
    header: () => <MercenaryIcon />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

export const WatchCountryDetails = () => {
  const [data, setData] = useState<MonitorRow[]>([]);
  const meta = useEu4Meta();
  const csvFilename = useSaveFilenameWith(`-watch-${meta.date}.csv`);

  const { error } = useEu4Worker(
    useCallback(async (worker) => {
      const monitor = await worker.eu4MonitoringData();

      setData((old) => {
        const newData = old.slice();
        newData.push(
          ...monitor.countries.map((x, i) => ({
            ...x,
            rowSpan: i == 0 ? monitor.countries.length : 0,
            date: monitor.date,
          })),
        );
        return newData;
      });
    }, []),
  );

  return (
    <div>
      <Alert.Error msg={error} />
      <div className="flex">
        <div className="text-md grow font-bold">Ledger</div>
        <IconButton
          shape="square"
          icon={<ProfileOutlined />}
          tooltip="download data as csv"
          onClick={async () => {
            const outData = data.map((x) => ({
              ...x,
              manpower: formatInt(x.manpower * 1000),
              treasury: formatInt(x.treasury - x.loans),
              development: formatInt(x.development),
              infantry_count: x.infantry_units.count,
              cavalry_count: x.cavalry_units.count,
              artillery_count: x.artillery_units.count,
            }));

            const csvData = createCsv(outData, [
              "date",
              "tag",
              "treasury",
              "raw_development",
              "development",
              "adm_mana",
              "dip_mana",
              "mil_mana",
              "manpower",
              "infantry_count",
              "cavalry_count",
              "artillery_count",
              "mercenary_units",
            ]);

            downloadData(
              new Blob([csvData], { type: "text/csv" }),
              csvFilename,
            );
          }}
        />
      </div>
      <DataTable columns={columns} data={data} />
    </div>
  );
};
