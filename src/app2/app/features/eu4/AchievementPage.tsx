import React from "react";
import { RankedSave, RecordTable } from "./components/RecordTable";
import { AchievementAvatar } from "./components/avatars";
import { Card } from "@/components/Card";
import { formatFloat, formatInt } from "@/lib/format";
import { cx } from "class-variance-authority";
import { TrophyIcon } from "@heroicons/react/24/solid";
import { TimeAgo } from "@/components/TimeAgo";
import { Link } from "@/components/Link";
import { difficultyColor, difficultyText } from "@/lib/difficulty";
import { Tooltip } from "@/components/Tooltip";
import { AchievementResponse } from "@/server-lib/fn/achievement";

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
    <div className="mx-auto mt-8 max-w-7xl p-5">
      <div className="mx-auto flex max-w-3xl flex-col">
        <div className="flex items-center gap-3">
          <AchievementAvatar id={achievementId} size={40} />
          <h1 className="text-4xl">{title} Leaderboard</h1>
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

function AchievementPlatform({
  save,
  className,
}: {
  save: RankedSave;
  className?: string;
}) {
  return (
    <Card
      className={cx(
        "relative min-w-64 max-w-64 shadow-lg transition-transform duration-100 lg:hover:scale-105",
        className,
      )}
    >
      <div
        className={cx(
          "absolute left-0 right-0 mx-auto text-center text-white",
          save.rank === 1 && "-top-9 h-16 w-16",
          save.rank === 2 && "-top-5 h-11 w-11",
          save.rank === 3 && "top-0.5 h-7 w-7",
        )}
      >
        <TrophyIcon className="fill-slate-200 stroke-slate-800 stroke-[0.5] drop-shadow-lg" />
      </div>

      <div
        className={cx(
          "h-8 rounded-t-lg shadow-lg",
          save.rank === 1 && "bg-yellow-500",
          save.rank === 2 && "bg-slate-400",
          save.rank === 3 && "bg-amber-800",
        )}
      ></div>

      <div className="px-8 pt-6">
        <div className="flex flex-col items-center pb-4">
          <Tooltip>
            <Tooltip.Trigger className="text-3xl font-semibold">
              {formatInt(save.weighted_score.days)}
            </Tooltip.Trigger>
            <Tooltip.Content>
              <table className="border-separate border-spacing-x-3 border-spacing-y-1 text-xl">
                <caption>Score calculation:</caption>
                <tr>
                  <td>{save.date}:</td>
                  <td className="text-right">{formatInt(save.days)}</td>
                </tr>
                <tr>
                  <td>Patch {save.patch}:</td>
                  <td className="text-right">
                    x{formatFloat(save.weighted_score.days / save.days, 2)}
                  </td>
                </tr>
                <tfoot>
                  <tr className="border-t border-white">
                    <td>{save.weighted_score.date}:</td>
                    <td className="text-right">
                      {formatInt(save.weighted_score.days)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </Tooltip.Content>
          </Tooltip>
          <p className="all-small-caps leading-tight tracking-tighter text-gray-600 dark:text-gray-400">
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
            <p className="text-gray-600 dark:text-gray-400">
              <TimeAgo date={save.upload_time} />
            </p>
          </div>
        </div>

        <p
          className={cx(
            "hidden text-center font-semibold lg:block",
            save.rank === 1 && "mt-14 text-9xl",
            save.rank === 2 && "mt-10 text-7xl",
            save.rank === 3 && "mt-6 text-5xl",
          )}
        >
          {save.rank}
        </p>
      </div>
      <Link
        className="mt-3 block border-t border-gray-300 py-2 text-center dark:border-gray-600"
        href={`/eu4/saves/${save.id}`}
      >
        View
      </Link>
    </Card>
  );
}

export const AchievementPodium = ({
  saves: [gold, silver, bronze],
}: {
  saves: (RankedSave | undefined)[];
}) => {
  return (
    <div className="mt-20 flex flex-col justify-center gap-8 lg:flex-row lg:items-end lg:gap-12">
      {gold && <AchievementPlatform save={gold} className="lg:order-2" />}
      {silver && <AchievementPlatform save={silver} className="lg:order-1" />}
      {bronze && <AchievementPlatform save={bronze} className="lg:order-3" />}
    </div>
  );
};

export const AchievementPage = ({
  achievement: data,
}: {
  achievement: AchievementResponse;
}) => {
  const [gold, silver, bronze, ...rest] = data.saves;
  return (
    <AchievementLayout
      achievementId={`${data.achievement.id}`}
      description={data.achievement.description}
      title={data.achievement.name}
    >
      <div className="flex flex-col gap-10">
        <AchievementPodium saves={[gold, silver, bronze]} />
        {data.goldDate ? (
          <div className="text-center">
            <p className="text-xl">
              Earn gold by completing the achievement before:
            </p>
            <p className="text-3xl font-semibold">{data.goldDate}</p>
          </div>
        ) : null}
        {rest.length ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-center text-lg font-semibold">
              Other completions:
            </h2>
            <RecordTable records={rest} />
          </div>
        ) : null}
      </div>
    </AchievementLayout>
  );
};
