import { useCallback, useEffect } from "react";
import {
  Treemap,
  TreemapConfig,
  useVisualizationDispatch,
} from "@/components/viz";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { createCsv } from "@/lib/csv";
import { useTagFilter } from "../../store";
import {
  OwnedDevelopmentStates,
  ProvinceDevelopment,
} from "../../types/models";
import { Flag } from "../../components/avatars";
import { formatInt } from "@/lib/format";
import { Alert } from "@/components/Alert";
import { isDarkMode } from "@/lib/dark";
import { classicCyclic } from "@/lib/colors";

export const OwnedDevelopmentStatesTree = () => {
  const countryFilter = useTagFilter();
  const { data, error } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4OwnedDevelopmentStates(countryFilter),
      [countryFilter],
    ),
  );
  const visualizationDispatch = useVisualizationDispatch();

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        if (data === undefined || data.length < 1) {
          return "";
        }

        const csv = data.map((row) => ({
          name: row.country.name,
          tag: row.country.tag,
          full_cores: row.fullCores,
          half_states: row.halfStates,
          overextension: row.noCore,
          tc: row.tc,
          territories: row.territories,
        }));

        const keys: (keyof (typeof csv)[number])[] = [
          "name",
          "tag",
          "full_cores",
          "half_states",
          "overextension",
          "tc",
          "territories",
        ];

        return createCsv(csv, keys);
      },
    });
  }, [data, visualizationDispatch]);

  if (error) {
    return <Alert.Error msg={error} />;
  }

  if (data?.[0] === undefined) {
    return null;
  }

  const max = countryDevelopmentTotal(data[0]);
  return (
    <div className="flex flex-wrap gap-4">
      {data.map((x) => (
        <CountryStateDevelopmentTree key={x.country.tag} dev={x} max={max} />
      ))}
    </div>
  );
};

function provinceDevelopmentTotal(x: ProvinceDevelopment) {
  return x.tax + x.production + x.manpower;
}

function countryDevelopmentTotal(x: OwnedDevelopmentStates) {
  return [x.fullCores, x.halfStates, x.noCore, x.tc, x.territories]
    .map(provinceDevelopmentTotal)
    .reduce((acc, x) => acc + x, 0);
}

type CountryDevelopmentTreeProps = {
  dev: OwnedDevelopmentStates;
  max: number;
};

function CountryStateDevelopmentTree({
  dev,
  max,
}: CountryDevelopmentTreeProps) {
  const devs = [
    {
      name: "Full Cores",
      value: provinceDevelopmentTotal(dev.fullCores),
    },
    {
      name: "Half States",
      value: provinceDevelopmentTotal(dev.halfStates),
    },
    {
      name: "No Core",
      value: provinceDevelopmentTotal(dev.noCore),
    },
    {
      name: "TCs",
      value: provinceDevelopmentTotal(dev.tc),
    },
    {
      name: "Territories",
      value: provinceDevelopmentTotal(dev.territories),
    },
  ] as const;

  const data = {
    name: "root",
    children: devs,
  };

  const total = countryDevelopmentTotal(dev);
  const dimension = Math.max(500 / (max / total), 150);
  const config: TreemapConfig = {
    data,
    colorField: "name",
    color(datum, defaultColor) {
      let x = datum as (typeof devs)[number];
      switch (x.name) {
        case "Full Cores":
          return classicCyclic[0];
        case "Half States":
          return classicCyclic[12];
        case "No Core":
          return classicCyclic[5];
        case "TCs":
          return classicCyclic[13];
        case "Territories":
          return classicCyclic[9];
        default:
          return defaultColor ?? "#000";
      }
    },
    legend:
      total === max
        ? {
            position: "bottom",
            itemName: {
              style: {
                fill: isDarkMode() ? "#fff" : "#000",
              },
            },
          }
        : false,

    tooltip: {},
    animation: {},
  };

  return (
    <div>
      <Flag tag={dev.country.tag} name={dev.country.name}>
        <Flag.Tooltip asChild>
          <Flag.DrawerTrigger className="gap-2 pr-4">
            <Flag.Image size="large" />
            <div className="flex flex-col items-start">
              <Flag.CountryName />
              <span className="font-normal">
                Development: {formatInt(total)}
              </span>
            </div>
          </Flag.DrawerTrigger>
        </Flag.Tooltip>
      </Flag>
      <div style={{ height: `${dimension}px`, width: `${dimension}px` }}>
        <Treemap {...config} />
      </div>
    </div>
  );
}
