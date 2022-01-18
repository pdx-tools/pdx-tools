import React, { useCallback, useState } from "react";
import type { BarConfig } from "@ant-design/charts";
import { useAnalysisWorker, WorkerClient } from "@/features/engine";
import { useSelector } from "react-redux";
import { selectEu4CountryFilter, useEu4Meta } from "@/features/eu4/eu4Slice";
import { Bar } from "@/components/viz";

interface IdeaGroupDatum {
  name: string;
  type: string;
  count: number;
}
export const IdeaGroupsChart: React.FC<{}> = () => {
  const [ideaGroups, setIdeaGroups] = useState<IdeaGroupDatum[]>([]);
  const countryFilter = useSelector(selectEu4CountryFilter);
  const meta = useEu4Meta();

  const cb = useCallback(
    async (worker: WorkerClient) => {
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
        seedIdeas.map((x) => [x, { count: 0, completed: 0 }])
      );
      for (let i = 0; i < rawIdeas.length; i++) {
        const idea = rawIdeas[i];
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

      const result = data.sort((a, b) => a.name.localeCompare(b.name));
      setIdeaGroups(result);
    },
    [countryFilter, meta.savegame_version.second]
  );

  useAnalysisWorker(cb);

  const config: BarConfig = {
    data: ideaGroups,
    autoFit: true,
    xField: "count",
    yField: "name",
    seriesField: "type",
    isGroup: true,
  };

  return (
    <div style={{ height: "100%" }}>
      <Bar {...config} />
    </div>
  );
};
