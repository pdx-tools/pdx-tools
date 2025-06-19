import { WebPage } from "@/components/layout/WebPage";
import { AchievementsPage } from "@/features/eu4/AchievementsPage";
import { seo } from "@/lib/seo";
import { loadAchievements } from "@/server-lib/game";
import type { Route } from "./+types/eu4.achievements._index";
import { useLoaderData } from "react-router";

export const meta: Route.MetaFunction = () =>
  seo({
    title: "EU4 Achievements - PDX Tools",
    description: "List of supported EU4 achievements on PDX.Tools",
  });

export const loader = () => {
  const achievements = loadAchievements().map((achievement) => ({
    id: achievement.id,
    name: achievement.name,
    description: achievement.description,
    difficulty: achievement.difficulty,
  }));
  return { achievements };
};

export default function Eu4Achievements(_props: Route.ComponentProps) {
  const { achievements } = useLoaderData<typeof loader>();

  return (
    <WebPage>
      <AchievementsPage staticAchievements={achievements} />
    </WebPage>
  );
}
