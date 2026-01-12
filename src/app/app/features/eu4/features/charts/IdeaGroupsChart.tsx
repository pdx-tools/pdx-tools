import { useCallback, useEffect, useMemo } from "react";
import { useAnalysisWorker } from "@/features/eu4/worker";
import type { Eu4Worker } from "@/features/eu4/worker";
import { EChart, useVisualizationDispatch } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { createCsv } from "@/lib/csv";
import { useEu4Meta, useTagFilter } from "../../store";
import { Alert } from "@/components/Alert";
import { isDarkMode } from "@/lib/dark";

interface IdeaGroupDatum {
  name: string;
  type: string;
  count: number;
}
export const IdeaGroupsChart = () => {
  const countryFilter = useTagFilter();
  const visualizationDispatch = useVisualizationDispatch();
  const meta = useEu4Meta();

  const cb = useCallback(
    async (worker: Eu4Worker) => {
      const rawIdeas = await worker.eu4GetNationIdeaGroups(countryFilter);
      const seedIdeas = [
        "aristocracy",
        "plutocracy",
        "innovativeness",
        "religious",
        "humanist",
        "spy",
        "diplomatic",
        "offensive",
        "defensive",
        "trade",
        "economic",
        "exploration",
        "maritime",
        "quality",
        "quantity",
        "expansion",
        "exploration",
        "exploration",
        "administrative",
        "humanist",
        "religious",
        "influence",
        "naval",
      ];

      if (meta.savegame_version.second >= 31) {
        seedIdeas.push("horde_gov");
        seedIdeas.push("theocracy_gov");
        seedIdeas.push("indigenous");
      }

      if (meta.savegame_version.second >= 35) {
        seedIdeas.push("court");
        seedIdeas.push("infrastructure");
        seedIdeas.push("mercenary");
      }

      type IdeaGroupStats = { count: number; completed: number };
      const ideas = new Map<string, IdeaGroupStats>(
        seedIdeas.map((x) => [x, { count: 0, completed: 0 }]),
      );
      for (const idea of rawIdeas) {
        const name = idea.groupName;
        const group = ideas.get(name) || { count: 0, completed: 0 };
        group.count += 1;
        group.completed += idea.completedIdeas === 7 ? 1 : 0;
        ideas.set(name, group);
      }

      const data: IdeaGroupDatum[] = [];
      for (const [name, count] of ideas) {
        data.push({
          name,
          type: "completed",
          count: count.completed,
        });
        data.push({
          name,
          type: "selected",
          count: count.count,
        });
      }

      return data.sort((a, b) => a.name.localeCompare(b.name));
    },
    [countryFilter, meta.savegame_version.second],
  );

  const { data: ideaGroups = [], error } = useAnalysisWorker(cb);

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        type IdeaGroupCsv = {
          ideaGroup: string;
          selected: number;
          completed: number;
        };
        const data: Record<string, Omit<IdeaGroupCsv, "ideaGroup">> = {};
        for (const group of ideaGroups) {
          data[group.name] = { ...data[group.name], [group.type]: group.count };
        }

        const flatten = Object.entries(data).map(([key, values]) => ({
          ideaGroup: key,
          ...values,
        }));
        return createCsv(flatten, ["ideaGroup", "selected", "completed"]);
      },
    });
  }, [ideaGroups, visualizationDispatch]);

  const isDark = isDarkMode();

  const option = useMemo((): EChartsOption => {
    // Get unique idea group names
    const ideaGroupNames = Array.from(
      new Set(ideaGroups.map((d) => d.name)),
    ).sort();

    // Organize data by type
    const completedData = ideaGroupNames.map((name) => {
      const datum = ideaGroups.find(
        (d) => d.name === name && d.type === "completed",
      );
      return datum?.count ?? 0;
    });

    const selectedData = ideaGroupNames.map((name) => {
      const datum = ideaGroups.find(
        (d) => d.name === name && d.type === "selected",
      );
      return datum?.count ?? 0;
    });

    return {
      grid: {
        left: 120,
        right: 40,
        top: 60,
        bottom: 60,
      },
      legend: {
        data: ["Completed", "Selected"],
        top: 10,
        textStyle: {
          color: isDark ? "#fff" : "#000",
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
      },
      xAxis: {
        type: "value",
        name: "Countries",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: {
          color: isDark ? "#ddd" : "#333",
          fontSize: 12,
        },
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: "dashed",
            color: isDark ? "#ddd" : "#333",
            opacity: 0.3,
            width: 1,
          },
        },
      },
      yAxis: {
        type: "category",
        name: "Idea Group",
        nameLocation: "end",
        nameTextStyle: {
          color: isDark ? "#ddd" : "#333",
          fontSize: 12,
        },
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
        data: ideaGroupNames,
      },
      series: [
        {
          name: "Completed",
          type: "bar",
          data: completedData,
          itemStyle: {
            color: isDark ? "#10b981" : "#059669",
          },
        },
        {
          name: "Selected",
          type: "bar",
          data: selectedData,
          itemStyle: {
            color: isDark ? "#93c5fd" : "#5B8FF9",
          },
        },
      ],
    };
  }, [ideaGroups, isDark]);

  return (
    <div className="h-[calc(100%-1px)]">
      <Alert.Error msg={error} />
      {ideaGroups.length !== 0 ? (
        <EChart option={option} style={{ height: "100%", width: "100%" }} />
      ) : null}
    </div>
  );
};
