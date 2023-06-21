import { Button, Table, Tooltip } from "antd";
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

type MonitorRow = CountryDetails & { date: Eu4Date; rowSpan: number };
export const WatchCountryDetails = () => {
  const [data, setData] = useState<MonitorRow[]>([]);
  const meta = useEu4Meta();
  const csvFilename = useSaveFilenameWith(`-watch-${meta.date}.csv`);

  useEu4Worker(
    useCallback(async (worker) => {
      const monitor = await worker.eu4MonitoringData();

      setData((old) => {
        const newData = old.slice();
        newData.push(
          ...monitor.countries.map((x, i) => ({
            ...x,
            rowSpan: i == 0 ? monitor.countries.length : 0,
            date: monitor.date,
          }))
        );
        return newData;
      });
    }, [])
  );

  return (
    <Table
      size="small"
      dataSource={data}
      rowKey={(row) => `${row.date}-${row.tag}`}
      pagination={false}
      title={() => (
        <div className="flex">
          <div className="text-md grow font-bold">Ledger</div>
          <Tooltip title="download data as csv">
            <Button
              icon={<ProfileOutlined />}
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
                  csvFilename
                );
              }}
            />
          </Tooltip>
        </div>
      )}
      columns={[
        {
          title: "Date",
          dataIndex: "date",
          className: "no-break",
          onCell: (data) => ({ rowSpan: data.rowSpan }),
        },
        {
          title: "Tag",
          dataIndex: "tag",
          render: (_: string, record: MonitorRow) => (
            <FlagAvatar tag={record.tag} name={record.name} size="small" />
          ),
        },
        {
          title: <GoldIcon />,
          align: "right",
          render: (_, record) => formatInt(record.treasury - record.loans),
        },
        {
          title: <DevelopmentIcon />,
          dataIndex: "raw_development",
          align: "right",
          render: (x: number) => formatInt(x),
        },
        {
          title: <AutonomyDevelopmentIcon />,
          dataIndex: "development",
          align: "right",
          render: (x: number) => formatInt(x),
        },
        {
          title: <AdminManaIcon />,
          dataIndex: "adm_mana",
          align: "right",
          render: (x: number) => formatInt(x),
        },
        {
          title: <DiplomaticManaIcon />,
          dataIndex: "dip_mana",
          align: "right",
          render: (x: number) => formatInt(x),
        },
        {
          title: <MilitaryManaIcon />,
          dataIndex: "mil_mana",
          align: "right",
          render: (x: number) => formatInt(x),
        },
        {
          title: <ManpowerIcon />,
          dataIndex: "manpower",
          align: "right",
          render: (x: number) => `${formatInt(x)}K`,
        },
        {
          title: <InfantryIcon />,
          dataIndex: ["infantry_units", "count"],
          align: "right",
          render: (x: number) => formatInt(x),
        },
        {
          title: <CavalryIcon />,
          dataIndex: ["cavalry_units", "count"],
          align: "right",
          render: (x: number) => formatInt(x),
        },
        {
          title: <ArtilleryIcon />,
          dataIndex: ["artillery_units", "count"],
          align: "right",
          render: (x: number) => formatInt(x),
        },
        {
          title: <MercenaryIcon />,
          dataIndex: "mercenary_units",
          align: "right",
          render: (x: number) => formatInt(x),
        },
      ]}
    />
  );
};
