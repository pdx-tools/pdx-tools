import React from "react";
import { RankedSave, RecordTable } from "./components/RecordTable";
import { pdxApi } from "@/services/appApi";
import { AchievementAvatar } from "./components/avatars";
import { useToastOnError } from "@/hooks/useToastOnError";
import { Card } from "@/components/Card";
import { formatInt } from "@/lib/format";
import { cx } from "class-variance-authority";
import { TrophyIcon } from "@heroicons/react/24/solid";
import { TimeAgo } from "@/components/TimeAgo";
import { Link } from "@/components/Link";
import { difficultyColor, difficultyText } from "@/lib/difficulty";

interface AchievementRoute {
  achievementId: string;
}

export const AchievementLayout = ({
  achievementId,
  title,
  description,
  children,
}: React.PropsWithChildren<{
  achievementId: string;
  title: string;
  description: string;
}>) => {
  return (
    <div className="mx-auto max-w-7xl p-5 mt-8">
      <div className="flex flex-col max-w-3xl mx-auto">
        <div className="flex gap-3 items-center">
          <AchievementAvatar id={achievementId} size={40} />
          <h1 className="text-4xl">
            {title} Leaderboard{" "}
            <span className="text-2xl self-end tracking-tighter text-gray-400 no-break">
              (id: {achievementId})
            </span>
          </h1>
        </div>
        <div className="mt-3 max-w-prose leading-snug">
          <p className="text-gray-600 dark:text-gray-300">{description}</p>
        </div>
        <div className="mt-2 max-w-prose leading-snug">
          <p className="text-gray-600 dark:text-gray-300">
            Achievement leaderboards are based on patch in-game days: the number
            of elapsed in game days, taxed 10% per patch behind the latest EU4
            minor version
          </p>
        </div>
      </div>

      {children}
    </div>
  );
};

function AchievementPodium({
  save,
  className,
}: {
  save: RankedSave;
  className?: string;
}) {
  return (
    <Card
      className={cx(
        "relative shadow-lg lg:hover:scale-105 transition-transform duration-100",
        className,
      )}
    >
      <div
        className={cx(
          "absolute mx-auto left-0 right-0 text-center text-white",
          save.rank === 1 && "h-16 w-16 -top-9",
          save.rank === 2 && "h-11 w-11 -top-5",
          save.rank === 3 && "h-7 w-7 top-0.5 ",
        )}
      >
        <TrophyIcon className="drop-shadow-lg fill-slate-800 dark:fill-slate-200" />
      </div>

      <div
        className={cx(
          "rounded-t-lg h-8 shadow-lg",
          save.rank === 1 && "bg-yellow-500",
          save.rank === 2 && "bg-slate-400",
          save.rank === 3 && "bg-amber-800",
        )}
      ></div>

      <div className="px-8 pt-4">
        <div className="flex flex-col items-center pb-4">
          <p className="text-3xl font-semibold">
            {formatInt(save.weighted_score.days)}
          </p>
          <p className="all-small-caps text-gray-600 dark:text-gray-400 tracking-tighter leading-tight">
            PATCH IN-GAME DAYS
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="text-xl">
            <Link href={`/users/${save.user_id}`}>{save.user_name}</Link>
          </div>

          <div className="flex flex-col items-center">
            <div className="text-xl">
              <span className="tracking-tight">{save.date}</span> on{" "}
              {save.patch}
            </div>
            {save.game_difficulty !== "Normal" ? (
              <p
                className={cx(
                  "all-small-caps leading-tight tracking-tighter",
                  difficultyColor(save.game_difficulty),
                )}
              >
                (ON {difficultyText(save.game_difficulty)})
              </p>
            ) : null}
            <p className=" text-gray-600 dark:text-gray-400">
              Uploaded: <TimeAgo date={save.upload_time} />
            </p>
          </div>
        </div>

        <p
          className={cx(
            "font-semibold text-center hidden lg:block",
            save.rank === 1 && "text-9xl mt-14",
            save.rank === 2 && "text-7xl mt-10",
            save.rank === 3 && "text-5xl mt-6",
          )}
        >
          {save.rank}
        </p>
      </div>
      <Link
        className="block text-center py-2 mt-3 border-t border-gray-300 dark:border-gray-600"
        href={`/eu4/saves/${save.id}`}
      >
        View
      </Link>
    </Card>
  );
}

export const AchievementPage = ({ achievementId }: AchievementRoute) => {
  const achievementQuery = pdxApi.achievement.useGet(achievementId);
  useToastOnError(achievementQuery.error, "Achievement data refresh failed");
  const achievement = achievementQuery.data.achievement;

  const [gold, silver, bronze, ...rest] = achievementQuery.data.saves;
  return (
    <AchievementLayout
      achievementId={`${achievement.id}`}
      description={achievement.description}
      title={achievement.name}
    >
      <div className="mt-24 flex flex-col gap-10">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 lg:items-end justify-center">
          {gold && <AchievementPodium save={gold} className="lg:order-2" />}
          {silver && <AchievementPodium save={silver} className="lg:order-1" />}
          {bronze && <AchievementPodium save={bronze} className="lg:order-3" />}
        </div>
        {achievementQuery.data.goldDate ? (
          <div className="text-center">
            <p className="text-xl">
              Earn gold by completing the achievement before:
            </p>
            <p className="text-3xl font-semibold">
              {achievementQuery.data.goldDate}
            </p>
          </div>
        ) : null}
        {rest.length ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg text-center font-semibold">
              Other completions:
            </h2>
            <RecordTable records={rest} />
          </div>
        ) : null}
      </div>
    </AchievementLayout>
  );
};
