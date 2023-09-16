import React, { useCallback, useMemo } from "react";
import { formatFloat, formatInt } from "@/lib/format";
import { CountryDetails, CountryReligion } from "../../types/models";
import { Pie, LegendColor, PieConfig } from "@/components/viz";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useEu4Worker } from "@/features/eu4/worker";
import { Tooltip } from "@/components/Tooltip";
import { Alert } from "@/components/Alert";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";

export interface CountryReligionsProps {
  details: CountryDetails;
}

export interface CountryReligionVizProps {
  data: CountryReligion[];
  largeLayout: boolean;
}

const columnHelper = createColumnHelper<CountryReligion>();

const columns = [
  columnHelper.accessor("name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Religion" />
    ),
    cell: ({ row }) => (
      <Tooltip>
        <Tooltip.Trigger className="flex items-center gap-2">
          <LegendColor color={row.original.color}></LegendColor>
          {row.original.name}
        </Tooltip.Trigger>
        <Tooltip.Content>{row.original.id}</Tooltip.Content>
      </Tooltip>
    ),
  }),

  columnHelper.group({
    header: "Provinces",
    columns: [
      columnHelper.accessor("provinces", {
        sortingFn: "basic",
        header: "Value",
        cell: (info) => (
          <div className="text-right">{formatInt(info.getValue())}</div>
        ),
      }),
      columnHelper.accessor("provinces_percent", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="%" />
        ),
        cell: (info) => (
          <div className="text-right">{formatFloat(info.getValue(), 2)}%</div>
        ),
      }),
    ],
  }),

  columnHelper.group({
    header: "Development",
    columns: [
      columnHelper.accessor("development", {
        sortingFn: "basic",
        header: "Value",
        cell: (info) => (
          <div className="text-right">{formatInt(info.getValue())}</div>
        ),
      }),
      columnHelper.accessor("development_percent", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="%" />
        ),
        cell: (info) => (
          <div className="text-right">{formatFloat(info.getValue(), 2)}%</div>
        ),
      }),
    ],
  }),
];

const CountryReligionVizImpl = ({
  data,
  largeLayout,
}: CountryReligionVizProps) => {
  const palette = useMemo(
    () => new Map(data.map((x) => [x.name, x.color])),
    [data],
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
      <DataTable
        data={data}
        columns={columns}
        initialSorting={[{ id: "development_percent", desc: true }]}
      />
      <Pie {...chartConfig} />
    </div>
  );
};

const CountryReligionViz = React.memo(CountryReligionVizImpl);

export const CountryReligions = ({ details }: CountryReligionsProps) => {
  const isMd = useBreakpoint("md");
  const { data, error } = useEu4Worker(
    useCallback(
      (worker) => worker.eu4GetCountryProvinceReligion(details.tag),
      [details.tag],
    ),
  );

  return (
    <>
      <Alert.Error msg={error} />
      {data ? (
        <>
          <CountryReligionViz data={data.religions} largeLayout={isMd} />
          <div className="flex flex-col gap-4">
            <p className="max-w-prose">
              State religion:
              <span className="font-semibold"> {details.religion} </span>
              {data.allowedConversions.length > 1 ? (
                <>
                  can directly convert to{" "}
                  {data.allowedConversions.map((x, i) => (
                    <React.Fragment key={x.id}>
                      {i != 0
                        ? i == data.allowedConversions.length - 1
                          ? " and "
                          : ", "
                        : ""}
                      <span key={x.id} className="font-semibold">
                        {x.name}
                      </span>
                    </React.Fragment>
                  ))}
                  .
                </>
              ) : null}
            </p>

            {data.rebel ? (
              <>
                <p className="max-w-prose">
                  To change the state religion to{" "}
                  <span className="font-semibold">
                    {data.rebel.religion.name}
                  </span>
                  , accept religious rebel demands once{" "}
                  <span className="font-semibold">
                    {data.rebel.religion.name}
                  </span>{" "}
                  has reached a <span className="font-semibold">plurality</span>{" "}
                  of development.{" "}
                </p>
                <div className="max-w-prose">
                  {data.rebel.until_plurality > 0 ? (
                    <>
                      <span className="font-semibold">
                        {data.rebel.religion.name}
                      </span>{" "}
                      needs{" "}
                      <span className="font-semibold">
                        {Number.isInteger(data.rebel.until_plurality)
                          ? formatInt(data.rebel.until_plurality)
                          : formatFloat(data.rebel.until_plurality, 2)}
                      </span>{" "}
                      additional development to reach{" "}
                      <span className="font-semibold">plurality</span>.
                    </>
                  ) : (
                    <div className="text-emerald-700">
                      <span className="font-semibold">
                        {data.rebel.religion.name}
                      </span>{" "}
                      elgible to be new state religion on rebel acceptance.
                    </div>
                  )}
                </div>
                <div>
                  <p className="max-w-prose">
                    Techniques to influence amount needed to reach plurality:
                  </p>
                  <ul className="list-disc list-inside pl-3">
                    {data.rebel.more_popular.map((x) => (
                      <li key={x.id}>
                        <span className="font-semibold">
                          ({formatInt(x.exploitable)} / {formatInt(x.provinces)}
                          )
                        </span>{" "}
                        {x.name} provinces with exploitable development
                      </li>
                    ))}
                    <li>
                      Allow religious rebels to siege down additional provinces
                    </li>
                    <li>
                      <span className="font-semibold">
                        {formatInt(data.rebel.religion.provinces)}
                      </span>{" "}
                      <span className="font-semibold">
                        {data.rebel.religion.name}
                      </span>{" "}
                      provinces can be developed with{" "}
                      <span className="font-semibold">
                        {formatInt(
                          Math.max(details.adm_mana, 0) +
                            Math.max(details.dip_mana, 0) +
                            Math.max(details.mil_mana, 0),
                        )}
                      </span>{" "}
                      available mana
                    </li>
                    <li>Release vassals and sell provinces</li>
                  </ul>
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
};
