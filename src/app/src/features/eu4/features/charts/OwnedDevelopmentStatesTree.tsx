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
import { FlagAvatar } from "../../components/avatars";
import { formatInt } from "@/lib/format";

export const OwnedDevelopmentStatesTree = () => {
  const countryFilter = useTagFilter();
  const { data } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4OwnedDevelopmentStates(countryFilter),
      [countryFilter]
    )
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
          return "#6D93F4";
        case "Half States":
          return "#6D5FF3";
        case "No Core":
          return "#EFC344";
        case "TCs":
          return "#687696";
        case "Territories":
          return "#7FD6AD";
        default:
          return defaultColor ?? "#000";
      }
    },
    legend:
      total === max
        ? {
            position: "bottom",
          }
        : false,

    tooltip: {},
    animation: {},
  };

  return (
    <div>
      <div className="flex items-center space-x-2">
        <FlagAvatar
          name={dev.country.name}
          tag={dev.country.tag}
          size="large"
        />
        <span>({formatInt(total)})</span>
      </div>
      <div style={{ height: `${dimension}px`, width: `${dimension}px` }}>
        <Treemap {...config} />
      </div>
    </div>
  );
}
