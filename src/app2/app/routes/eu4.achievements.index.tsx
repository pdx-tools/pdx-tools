import { WebPage } from "@/components/layout/WebPage";
import { AchievementsPage } from "@/features/eu4/AchievementsPage";
import { loadAchievements } from "@/server-lib/game";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";

const fetchAchievements = createServerFn("GET", () => {
  const achievements = loadAchievements();
  return achievements.map((achievement) => ({
    id: achievement.id,
    name: achievement.name,
    description: achievement.description,
    difficulty: achievement.difficulty,
  }));
});

export const Route = createFileRoute("/eu4/achievements/")({
  loader: async () => ({ achievements: await fetchAchievements() }),
  component: Eu4Achievements,
});

function Eu4Achievements() {
  const { achievements } = Route.useLoaderData();

  return (
    <WebPage>
      <AchievementsPage staticAchievements={achievements} />
    </WebPage>
  );
}
