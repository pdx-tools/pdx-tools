import { useMemo } from "react";
import { AchievementAvatar } from "@/features/eu4/components/avatars";
import { Tooltip } from "@/components/Tooltip";
import { difficultyNum, difficultyText } from "@/lib/difficulty";
import { formatInt } from "@/lib/format";
import type { Achievement } from "@/services/appApi";

/**
 * Every recognized achievement as its own icon, grouped by difficulty and
 * ordered from the easiest band to the hardest. A player recognizes these
 * icons from the game, so the wall is faster to search by eye than a table
 * of names, and it fits a run's worth of targets in one screen.
 */
export function AchievementWall({ achievements }: { achievements: Achievement[] }) {
  const bands = useMemo(() => {
    const byDifficulty = new Map<string, Achievement[]>();
    for (const achievement of achievements) {
      const key = achievement.difficulty;
      const band = byDifficulty.get(key);
      if (band) {
        band.push(achievement);
      } else {
        byDifficulty.set(key, [achievement]);
      }
    }

    return [...byDifficulty.entries()]
      .map(([difficulty, list]) => ({
        difficulty,
        list: [...list].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort(
        (a, b) =>
          difficultyNum(a.difficulty as Achievement["difficulty"]) -
          difficultyNum(b.difficulty as Achievement["difficulty"]),
      );
  }, [achievements]);

  return (
    <Tooltip.Provider delayDuration={120}>
      <div className="flex flex-col gap-7">
        {bands.map((band) => (
          <section key={band.difficulty} className="flex flex-col gap-3">
            <h3 className="flex items-baseline gap-2 font-mono text-xs tracking-[0.12em] text-gray-600 uppercase dark:text-gray-400">
              {difficultyText(band.difficulty as Achievement["difficulty"])}
              <span className="text-gray-500 tabular-nums dark:text-gray-500">
                {formatInt(band.list.length)}
              </span>
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {band.list.map((achievement) => (
                <li key={achievement.id}>
                  <Tooltip>
                    <Tooltip.Trigger asChild>
                      <AchievementAvatar
                        id={achievement.id}
                        name={achievement.name}
                        size={40}
                        className="block rounded-sm ring-offset-2 ring-offset-white transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-sky-600 dark:ring-offset-slate-900"
                      />
                    </Tooltip.Trigger>
                    <Tooltip.Content className="max-w-72">
                      <div className="font-semibold">{achievement.name}</div>
                      <div className="mt-1 text-sm opacity-80">{achievement.description}</div>
                    </Tooltip.Content>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Tooltip.Provider>
  );
}
