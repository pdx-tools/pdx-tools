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
import { RebelReligion } from "../../../../../../wasm-eu4/pkg/wasm_eu4";
import { Link } from "@/components/Link";
import { isDarkMode } from "@/lib/dark";

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
    legend: {
      itemName: {
        style: {
          fill: isDarkMode() ? "#fff" : "#000",
        },
      },
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
          color: isDarkMode() ? "#fff" : "#000",
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

const EmojiKey = ({ value }: { value: boolean | undefined }) => {
  switch (value) {
    case true:
      return "✔️";
    case false:
      return "❌";
    case undefined:
      return "❔";
  }
};

const RebelConvert = ({ rebel }: { rebel: RebelReligion }) => {
  const religion = rebel.religion;
  let dev = Number.isInteger(rebel.until_plurality)
    ? formatInt(rebel.until_plurality)
    : formatFloat(rebel.until_plurality, 2);

  if (
    religion.force_convert_on_break === false &&
    religion.negotiate_convert_on_dominant_religion === false
  ) {
    return (
      <p className="max-w-prose">
        It is not possible to change the state religion to{" "}
        <span className="font-semibold">{religion.name}</span> via rebels.
      </p>
    );
  }

  return (
    <div className="max-w-prose">
      How to change the state religion to{" "}
      <span className="font-semibold">{religion.name}</span> via rebels:
      <ul className="pl-3">
        <li>
          <EmojiKey value={rebel.until_plurality <= 0} />{" "}
          {rebel.until_plurality <= 0 ? (
            <>
              <span className="font-semibold">{rebel.religion.name}</span> has
              reached a plurality of development
            </>
          ) : (
            <>
              <span className="font-semibold">{rebel.religion.name}</span> needs{" "}
              <span className="font-semibold">{dev}</span> additional
              development to reach{" "}
              <span className="font-semibold">plurality</span>
            </>
          )}
        </li>
        <li className="pt-1">
          Afterwards, the following actions will change the state religion:
          <ul className="pl-3">
            <li>
              <EmojiKey
                value={religion.negotiate_convert_on_dominant_religion}
              />{" "}
              Accept <span className="font-semibold">{religion.name}</span>{" "}
              rebel demands
            </li>
            <li>
              <EmojiKey value={religion.force_convert_on_break} /> Wait for{" "}
              <span className="font-semibold">{religion.name}</span> rebels to
              enforce demands
            </li>
          </ul>
        </li>
      </ul>
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
                <RebelConvert rebel={data.rebel} />
                {data.rebel.religion.force_convert_on_break !== false ||
                data.rebel.religion.negotiate_convert_on_dominant_religion !==
                  false ? (
                  <div>
                    <p className="max-w-prose">
                      Techniques to influence amount needed to reach plurality:
                    </p>
                    <ul className="list-inside list-disc pl-3">
                      {data.rebel.more_popular.map((x) => (
                        <li key={x.id}>
                          <span className="font-semibold">
                            ({formatInt(x.exploitable)} /{" "}
                            {formatInt(x.provinces)})
                          </span>{" "}
                          {x.name} provinces with exploitable development
                        </li>
                      ))}
                      <li>
                        Allow{" "}
                        <Link href="https://eu4.paradoxwikis.com/Rebellion#All_faction_types">
                          religious rebels
                        </Link>{" "}
                        to spawn and siege down additional provinces
                      </li>
                      {data.rebel.until_plurality > 0 ? (
                        <li>
                          Conquer{" "}
                          <span className="font-semibold">
                            {data.rebel.religion.name}
                          </span>{" "}
                          provinces worth{" "}
                          <span className="font-semibold">
                            {Number.isInteger(data.rebel.until_plurality)
                              ? formatInt(data.rebel.until_plurality)
                              : formatFloat(data.rebel.until_plurality, 2)}
                          </span>{" "}
                          development
                        </li>
                      ) : null}
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
                ) : null}
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
};
