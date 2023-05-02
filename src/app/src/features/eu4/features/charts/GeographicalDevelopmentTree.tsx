import { useCallback, useEffect } from "react";
import {
  Treemap,
  TreemapConfig,
  useVisualizationDispatch,
} from "@/components/viz";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { formatInt } from "@/lib/format";
import { createCsv } from "@/lib/csv";
import { useTagFilter } from "../../store";

type DevelopmentStatisticProps = {
  title: string;
  tax: number;
  production: number;
  manpower: number;
};

const DevelopmentStatistic = ({
  tax,
  production,
  manpower,
  title,
}: DevelopmentStatisticProps) => {
  return (
    <div className="flex flex-col items-center">
      <span className="text-lg">{title}</span>
      <span className="flex items-baseline gap-3">
        <span className="text-2xl font-bold">
          {formatInt(tax + production + manpower)}
        </span>
        <span className="text-gray-500">
          ({formatInt(tax)} / {formatInt(production)} / {formatInt(manpower)})
        </span>
      </span>
    </div>
  );
};

export const GeographicalDevelopmentTree = () => {
  const countryFilter = useTagFilter();
  const { data } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4GeographicalDevelopment(countryFilter),
      [countryFilter]
    )
  );
  const visualizationDispatch = useVisualizationDispatch();

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        if (data === undefined) {
          return "";
        }

        const csv = data.children.flatMap((continent) =>
          continent.children.flatMap((superregion) =>
            superregion.children.flatMap((region) =>
              region.children.flatMap((area) =>
                area.children.map((prov) => ({
                  continent: continent.name,
                  superregion: superregion.name,
                  region: region.name,
                  area: area.name,
                  province: prov.name,
                  tax: prov.tax,
                  production: prov.production,
                  manpower: prov.manpower,
                }))
              )
            )
          )
        );

        const keys: (keyof (typeof csv)[number])[] = [
          "continent",
          "superregion",
          "region",
          "area",
          "province",
          "tax",
          "production",
          "manpower",
        ];

        return createCsv(csv, keys);
      },
    });
  }, [data, visualizationDispatch]);

  const config: TreemapConfig = {
    data: data,
    colorField: "name",
    legend: {
      position: "top-left",
    },
    hierarchyConfig: {
      sort(a, b) {
        // Sort by name so that names like "africa" are always
        // assigned the same color across saves
        return a.data.name.localeCompare(b.data.name);
      },
    },

    tooltip: {
      formatter: (v) => {
        const root = v.path[v.path.length - 1];
        const datum = v.path[0].data;
        return {
          name: v.name,
          value: `${formatInt(datum.value)} (${formatInt(
            (datum.value / root.value) * 100
          )}%) (${formatInt(datum.tax)} / ${formatInt(
            datum.production
          )} / ${formatInt(datum.manpower)})`,
        };
      },
    },

    drilldown: {
      enabled: true,
      breadCrumb: {
        position: "bottom-left",
        rootText: "back to top",
      },
    },
    animation: {},
  };

  if (data === undefined) {
    return null;
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex justify-around">
        <DevelopmentStatistic
          tax={data.world_tax}
          production={data.world_production}
          manpower={data.world_manpower}
          title="World Development"
        />
        <DevelopmentStatistic
          tax={data.filtered_tax}
          production={data.filtered_production}
          manpower={data.filtered_manpower}
          title="Filtered Development"
        />
        <DevelopmentStatistic
          tax={data.uncolonized_tax}
          production={data.uncolonized_production}
          manpower={data.uncolonized_manpower}
          title="Uncolonized Development"
        />
      </div>
      <div className="h-full grow">
        <Treemap {...config} />
      </div>
    </div>
  );
};
