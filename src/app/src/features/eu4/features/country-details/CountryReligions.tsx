import React, { useCallback, useMemo, useState } from "react";
import { PieConfig } from "@ant-design/charts";
import { Button, Table, Tooltip } from "antd";
import { ColumnType } from "antd/lib/table";
import { formatFloat, formatInt } from "@/lib/format";
import { CountryDetails, CountryReligion } from "../../types/models";
import { Pie, LegendColor } from "@/components/viz";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { getEu4Worker, useEu4Worker } from "@/features/eu4/worker";
import { proxy } from "comlink";
import { useEu4Actions } from "../../store";

export interface CountryReligionsProps {
  details: CountryDetails;
}

export interface CountryReligionVizProps {
  data: CountryReligion[];
  largeLayout: boolean;
}

const CountryReligionVizImpl = ({
  data,
  largeLayout,
}: CountryReligionVizProps) => {
  const columns: ColumnType<CountryReligion>[] = [
    {
      title: "Religion",
      dataIndex: ["religion", "name"],
      render: (_name: string, x: CountryReligion) => (
        <Tooltip title={x.id}>
          <div className="flex items-center gap-2">
            <LegendColor color={x.color}></LegendColor>
            {x.name}
          </div>
        </Tooltip>
      ),
      sorter: (a: CountryReligion, b: CountryReligion) =>
        a.name.localeCompare(b.name),
    },
    {
      title: "Provinces",
      dataIndex: "provinces",
      align: "right",
      sorter: (a: CountryReligion, b: CountryReligion) =>
        a.provinces - b.provinces,
      render: (_: number, x) =>
        `${formatInt(x.provinces)} (${formatFloat(x.provinces_percent, 2)}%)`,
    },
    {
      title: "Development",
      dataIndex: "development",
      defaultSortOrder: "descend",
      align: "right",
      sorter: (a: CountryReligion, b: CountryReligion) =>
        a.development - b.development,
      render: (_: number, x) =>
        `${formatInt(x.development)} (${formatFloat(
          x.development_percent,
          2
        )}%)`,
    },
  ];

  const palette = useMemo(
    () => new Map(data.map((x) => [x.name, x.color])),
    [data]
  );

  const chartConfig: PieConfig = {
    data,
    angleField: "development",
    colorField: "name",
    autoFit: true,
    innerRadius: 0.5,
    color: (data) => palette.get(data.name) || "#000",
    label: {
      type: "inner",
      offset: "-30%",
      formatter: (_text: any, item: any) =>
        `${item._origin.development.toFixed(0)}`,
    },
    interactions: [{ type: "element-active" }],
    statistic: {
      title: false,
      content: {
        style: {
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: "24px",
        },
        formatter: () => "Religion\nDev",
      },
    },
  };

  return (
    <div
      className="flex items-center gap-2"
      style={{ flexDirection: largeLayout ? "row" : "column" }}
    >
      <Table
        size="small"
        rowKey={(record) => `${record.id}`}
        dataSource={data}
        scroll={{ x: true }}
        pagination={false}
        columns={columns}
      />
      <Pie {...chartConfig} />
    </div>
  );
};

const CountryReligionViz = React.memo(CountryReligionVizImpl);

export const CountryReligions = ({ details }: CountryReligionsProps) => {
  const isMd = useBreakpoint("md");
  const { data = [] } = useEu4Worker(
    useCallback(
      (worker) => worker.eu4GetCountryProvinceReligion(details.tag),
      [details.tag]
    )
  );

  return (
    <>
      <CountryReligionViz data={data} largeLayout={isMd} />
      <PollSave />
    </>
  );
};

const PollSave = () => {
  const [running, setRunning] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<undefined | Date>(undefined);
  const { data } = useEu4Worker((worker) => worker.supportsFileObserver());
  const actions = useEu4Actions();
  if (data !== true) {
    return null;
  }

  return (
    <div>
      <h2>Save watcher (experimental)</h2>
      <p className="max-w-prose">
        Watching a save will update PDX Tools whenever the loaded save has
        changed. Stop manually keeping track of how much to dev push to balance
        religions, have PDX Tools automatically recalculate for you.
      </p>
      {lastUpdate ? (
        <p>Last updated: {lastUpdate.toLocaleTimeString()}</p>
      ) : null}
      <div className="flex gap-4">
        <Button
          onClick={() => {
            setRunning(true);
            getEu4Worker().startFileObserver(
              proxy(async ({ meta, achievements }) => {
                actions.updateSave({
                  meta,
                  achievements,
                  countries: await getEu4Worker().eu4GetCountries(),
                });
                setLastUpdate(new Date());
              })
            );
          }}
          disabled={running}
        >
          Start watch
        </Button>
        <Button disabled={!running} onClick={() => setRunning(false)}>
          Stop watch
        </Button>
      </div>
    </div>
  );
};
