import React, { useCallback, useEffect } from "react";
import { useAnalysisWorker, Eu4Worker } from "@/features/eu4/worker";
import { Bar, BarConfig, useVisualizationDispatch } from "@/components/viz";
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

      type afaf = { count: number; completed: number };
      const ideas = new Map<string, afaf>(
        seedIdeas.map((x) => [x, { count: 0, completed: 0 }]),
      );
      for (const idea of rawIdeas) {
        const name = idea.groupName;
        const group = ideas.get(name) || { count: 0, completed: 0 };
        group.count += 1;
        group.completed += idea.completedIdeas === 7 ? 1 : 0;
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

  const config: BarConfig = {
    data: ideaGroups,
    autoFit: true,
    xField: "count",
    yField: "name",
    seriesField: "type",
    isGroup: true,
    legend: {
      itemName: {
        style: {
          fill: isDarkMode() ? "#fff" : "#000",
        },
      },
    },
  };

  return (
    <div className="h-[calc(100%-1px)]">
      <Alert.Error msg={error} />
      <Bar {...config} />
    </div>
  );
};
