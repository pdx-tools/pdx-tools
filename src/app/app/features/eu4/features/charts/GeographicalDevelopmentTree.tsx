import { useCallback, useEffect, useMemo } from "react";
import { EChart, useVisualizationDispatch } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { formatInt } from "@/lib/format";
import { createCsv } from "@/lib/csv";
import { useTagFilter } from "../../store";
import { Alert } from "@/components/Alert";
import { isDarkMode } from "@/lib/dark";
import type { RootTree } from "@/wasm/wasm_eu4";

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
      <span className="flex flex-col items-center gap-1">
        <span className="text-2xl font-bold">
          {formatInt(tax + production + manpower)}
        </span>
        <div className="flex gap-4 text-gray-500 dark:text-gray-300">
          <div className="flex flex-col items-center leading-none">
            <div className="all-small-caps text-sm">tax</div>
            <div>{formatInt(tax)}</div>
          </div>

          <div className="flex flex-col items-center leading-none">
            <div className="all-small-caps text-sm">prod</div>
            <div>{formatInt(production)}</div>
          </div>

          <div className="flex flex-col items-center leading-none">
            <div className="all-small-caps text-sm">man</div>
            <div>{formatInt(manpower)}</div>
          </div>
        </div>
      </span>
    </div>
  );
};

type DevelopmentTreeInput = {
  name: string;
  value?: number;
  tax?: number;
  production?: number;
  manpower?: number;
  children?: DevelopmentTreeInput[];
};

type DevelopmentTreeNode = {
  name: string;
  value: number;
  tax: number;
  production: number;
  manpower: number;
  children?: DevelopmentTreeNode[];
};

const normalizeTree = (node: DevelopmentTreeInput): DevelopmentTreeNode => {
  const children = node.children?.map(normalizeTree);
  const tax = Number(node.tax ?? 0);
  const production = Number(node.production ?? 0);
  const manpower = Number(node.manpower ?? 0);

  if (children && children.length > 0) {
    const totals = children.reduce(
      (acc, child) => {
        acc.value += child.value;
        acc.tax += child.tax;
        acc.production += child.production;
        acc.manpower += child.manpower;
        return acc;
      },
      { value: 0, tax: 0, production: 0, manpower: 0 },
    );

    return {
      name: node.name,
      value: Number((node.value ?? totals.value) || 0),
      tax: Number.isFinite(node.tax) ? tax : totals.tax,
      production: Number.isFinite(node.production)
        ? production
        : totals.production,
      manpower: Number.isFinite(node.manpower) ? manpower : totals.manpower,
      children,
    };
  }

  const fallbackValue = tax + production + manpower;

  return {
    name: node.name,
    value: Number(node.value ?? fallbackValue),
    tax,
    production,
    manpower,
  };
};

export const GeographicalDevelopmentTree = () => {
  const countryFilter = useTagFilter();
  const { data, error } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4GeographicalDevelopment(countryFilter),
      [countryFilter],
    ),
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
                })),
              ),
            ),
          ),
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

  if (error !== undefined) {
    <Alert.Error msg={error} />;
  }

  if (data === undefined) {
    return null;
  }

  return <GeographicalDevelopmentTreeData data={data} />;
};

function GeographicalDevelopmentTreeData({ data }: { data: RootTree }) {
  const isDark = isDarkMode();
  const treeData = useMemo(
    () =>
      normalizeTree({
        ...data,
        name: data.name || "World",
      } as unknown as DevelopmentTreeInput),
    [data],
  );

  const option = useMemo((): EChartsOption => {
    // Convert tree data to ECharts format
    const convertToEChartsFormat = (node: DevelopmentTreeNode) => {
      const result: any = {
        name: node.name,
        value: node.value,
        tax: node.tax,
        production: node.production,
        manpower: node.manpower,
      };

      if (node.children && node.children.length > 0) {
        result.children = node.children
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(convertToEChartsFormat);
      }

      return result;
    };

    const echartsData = convertToEChartsFormat(treeData);

    return {
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) {
            return "";
          }
          const data = params.data as {
            name: string;
            value: number;
            tax?: number;
            production?: number;
            manpower?: number;
          };
          const { name, value, tax, production, manpower } = data;
          const percentage = (params as any).treePathInfo
            ? ((value / echartsData.value) * 100).toFixed(0)
            : "100";

          return `
            <strong>${name}</strong><br/>
            Development: ${formatInt(value)} (${percentage}%)<br/>
            Tax: ${formatInt(tax ?? 0)}<br/>
            Production: ${formatInt(production ?? 0)}<br/>
            Manpower: ${formatInt(manpower ?? 0)}
          `;
        },
      },
      series: [
        {
          name: "World",
          type: "treemap",
          data: echartsData.children,
          leafDepth: 2,
          roam: false,
          nodeClick: "link",
          breadcrumb: {
            show: true,
            height: 30,
            bottom: 0,
            itemStyle: {
              color: isDark
                ? "rgba(255, 255, 255, 0.25)"
                : "rgba(0, 0, 0, 0.25)",
              borderColor: isDark ? "#666" : "#999",
              borderWidth: 1,
              shadowColor: "rgba(0, 0, 0, 0.15)",
              shadowBlur: 3,
              textStyle: {
                color: isDark ? "#fff" : "rgba(0, 0, 0, 0.85)",
              },
            },
            emphasis: {
              itemStyle: {
                color: isDark
                  ? "rgba(255, 255, 255, 0.5)"
                  : "rgba(0, 0, 0, 0.5)",
                textStyle: {
                  color: isDark ? "#fff" : "#000",
                },
              },
            },
          },
          label: {
            show: true,
            formatter: "{b}",
            color: isDark ? "#fff" : "#000",
            fontSize: 10,
            overflow: "truncate",
          },
          upperLabel: {
            show: true,
            height: 20,
            color: isDark ? "#fff" : "#000",
            fontSize: 12,
            fontWeight: "bold",
          },
          itemStyle: {
            borderColor: isDark ? "#333" : "#fff",
            borderWidth: 1,
            gapWidth: 1,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.5)",
            },
          },
          levels: [
            {
              itemStyle: {
                borderWidth: 0,
                gapWidth: 5,
              },
            },
            {
              itemStyle: {
                borderWidth: 3,
                gapWidth: 3,
              },
              colorSaturation: [0.35, 0.5],
            },
            {
              itemStyle: {
                borderWidth: 2,
                gapWidth: 2,
              },
              colorSaturation: [0.3, 0.45],
            },
            {
              itemStyle: {
                borderWidth: 1,
                gapWidth: 1,
              },
              colorSaturation: [0.25, 0.4],
            },
          ],
          visualMin: 0,
          visualMax: echartsData.value,
          colorAlpha: [0.5, 1],
        },
      ],
    };
  }, [treeData, isDark]);

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
      <div className="h-[calc(100%-1px)]">
        <EChart option={option} style={{ height: "100%", width: "100%" }} />
      </div>
    </div>
  );
}
