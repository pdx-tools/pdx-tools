import { useCallback, useEffect, useMemo } from "react";
import { EChart, useVisualizationDispatch } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { createCsv } from "@/lib/csv";
import { useTagFilter } from "../../store";
import type {
  OwnedDevelopmentStates,
  ProvinceDevelopment,
} from "../../types/models";
import { Flag } from "../../components/avatars";
import { formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
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

function getColor(name: string) {
  switch (name) {
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
      return "#000";
  }
}

function CountryStateDevelopmentTree({
  dev,
  max,
}: CountryDevelopmentTreeProps) {
  const isDark = isDarkMode();

  const devs = useMemo(
    () =>
      [
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
      ] as const,
    [dev],
  );

  const total = countryDevelopmentTotal(dev);
  const dimension = Math.max(500 / (max / total), 150);

  const option = useMemo((): EChartsOption => {
    return {
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) {
            return "";
          }
          return `
            <strong>${escapeEChartsHtml(params.name)}</strong><br/>
            ${formatInt(params.value as number)}
          `;
        },
      },
      series: [
        {
          type: "treemap",
          name: "Development",
          roam: false,
          nodeClick: false,
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          data: devs.map((d) => ({
            name: d.name,
            value: d.value,
            itemStyle: {
              color: getColor(d.name),
            },
          })),
          breadcrumb: {
            show: false,
          },
          label: {
            show: true,
            formatter: "{b}",
            color: "#fff",
            fontSize: 12,
            fontWeight: "bold",
          },
          itemStyle: {
            borderColor: isDark ? "#333" : "#fff",
            borderWidth: 2,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.5)",
            },
          },
        },
      ],
    };
  }, [devs, isDark]);

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
        <EChart option={option} style={{ height: "100%", width: "100%" }} />
      </div>
    </div>
  );
}
