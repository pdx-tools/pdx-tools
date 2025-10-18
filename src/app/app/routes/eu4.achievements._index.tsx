import { WebPage } from "@/components/layout/WebPage";
import { AchievementsPage } from "@/features/eu4/AchievementsPage";
import { seo } from "@/lib/seo";
import { loadAchievements } from "@/server-lib/game";
import type { MetaFunction } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";

export const meta: MetaFunction = () =>
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

export default function Eu4Achievements() {
  const { achievements } = useLoaderData<typeof loader>();

  return (
    <WebPage>
      <AchievementsPage staticAchievements={achievements} />
    </WebPage>
  );
}
