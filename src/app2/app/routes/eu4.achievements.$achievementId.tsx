import { WebPage } from "@/components/layout";
import { AchievementPage } from "@/features/eu4/AchievementPage";
import { fetchAchievement } from "@/server-lib/fn/achievement";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";

export const achievementFn = createServerFn(
  "GET",
  (...args: Parameters<typeof fetchAchievement>) => {
    return fetchAchievement(...args);
  },
);

export const Route = createFileRoute("/eu4/achievements/$achievementId")({
  loader: async ({ params }) => ({
    achievement: await achievementFn(params),
  }),
  component: Eu4Achievement,
});

function Eu4Achievement() {
  const data = Route.useLoaderData();
  return (
    <WebPage>
      <AchievementPage achievement={data.achievement} />
    </WebPage>
  );
}
