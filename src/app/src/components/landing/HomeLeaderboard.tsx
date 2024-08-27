import { Suspense } from "react";
import { LoadingState } from "../LoadingState";
import { ErrorBoundary } from "@sentry/nextjs";
import { pdxApi } from "@/services/appApi";
import { AchievementPodium } from "@/features/eu4/AchievementPage";
import { cx } from "class-variance-authority";
import { AchievementAvatar } from "@/features/eu4/components/avatars";
import { Link } from "../Link";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { Accordion } from "../Accordion";
import { MedalIcon } from "../icons/Medal";
import { TimeAgo } from "../TimeAgo";
import { formatInt } from "@/lib/format";

let globalShow = false;

const HomeLeaderboardImpl = () => {
  const achievementId = "348";
  const achievementQuery = pdxApi.achievement.useGet(achievementId);
  if (achievementQuery.data.saves.length < 3) {
    return null;
  }

  return (
    <>
      <h3 className="flex flex-col items-center gap-3 text-2xl font-bold">
        <p>Featured leaderboard:</p>
        <div className="flex items-center gap-2">
          <AchievementAvatar
            size={40}
            id={achievementQuery.data.achievement.id}
          />
          <Link href={`/eu4/achievements/${achievementId}`}>
            {achievementQuery.data.achievement.name}
          </Link>
        </div>
      </h3>
      <AchievementPodium saves={achievementQuery.data.saves} />
    </>
  );
};

function medalRankColor(rank: number) {
  switch (rank) {
    case 3:
      return "text-amber-800";
    case 2:
      return "text-slate-400";
    default:
      return "text-yellow-500";
  }
}

const Medalists = () => {
  const medalistQuery = pdxApi.medalists.useGet();

  return (
    <>
      <p className="pb-5 pt-12 text-center text-2xl font-bold">
        Top achievement medalists:
      </p>
      <Accordion type="multiple" className="mx-auto max-w-2xl">
        {medalistQuery.data.medalists.map((medalist) => (
          <Accordion.Item
            key={medalist.user_id}
            value={medalist.user_id}
            className="dark:border-gray-600"
          >
            <Accordion.Header>
              <div className="flex w-full items-center gap-8 px-8 dark:bg-slate-800">
                <Link className="text-2xl" href={`/users/${medalist.user_id}`}>
                  {medalist.user_name}
                </Link>
                <Accordion.Trigger className="justify-end">
                  <div className="flex gap-8 pr-8">
                    <div className="flex w-16">
                      <MedalIcon
                        className={cx(
                          "h-8 w-8 stroke-slate-900 dark:stroke-slate-500",
                          medalRankColor(1),
                        )}
                      />
                      <div className="grow text-right text-2xl">
                        {formatInt(medalist.golds)}
                      </div>
                    </div>
                    <div className="flex w-16">
                      <MedalIcon
                        className={cx(
                          "h-8 w-8 stroke-slate-900 dark:stroke-slate-500",
                          medalRankColor(2),
                        )}
                      />
                      <div className="grow text-right text-2xl">
                        {formatInt(medalist.silvers)}
                      </div>
                    </div>
                    <div className="flex w-16">
                      <MedalIcon
                        className={cx(
                          "h-8 w-8 stroke-slate-900 dark:stroke-slate-500",
                          medalRankColor(3),
                        )}
                      />
                      <div className="grow text-right text-2xl">
                        {formatInt(medalist.bronzes)}
                      </div>
                    </div>
                  </div>
                </Accordion.Trigger>
              </div>
            </Accordion.Header>
            <Accordion.Content className="mx-auto flex max-w-lg flex-col divide-y-2 dark:bg-slate-800">
              {medalist.saves.map((save) => (
                <div
                  className="flex items-center gap-4 px-6 py-4 dark:border-gray-600"
                  key={save.id}
                >
                  <MedalIcon
                    className={cx(
                      "h-8 w-8 stroke-slate-900 dark:stroke-slate-500",
                      medalRankColor(save.rank),
                    )}
                  />
                  <AchievementAvatar id={save.achievement} size={40} />
                  <p>{save.date}</p>
                  <p>{save.patch}</p>
                  <p className="w-[7ch]">
                    {formatInt(save.weighted_score.days)}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    <TimeAgo date={save.upload_time} />
                  </p>
                  <Link
                    className="flex-grow text-end"
                    href={`/eu4/saves/${save.id}`}
                  >
                    View
                  </Link>
                </div>
              ))}
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion>
    </>
  );
};

export const HomeLeaderboard = () => {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLDivElement>({
    threshold: 0.1,
    rootMargin: "200px",
  });

  let show = (globalShow ||= isIntersecting);

  return (
    <div ref={ref} className={cx(!show && "h-[750px]")}>
      {show ? (
        <Suspense
          fallback={
            <div className="h-[750px]">
              <LoadingState />
            </div>
          }
        >
          <ErrorBoundary fallback={() => <></>}>
            <HomeLeaderboardImpl />
          </ErrorBoundary>
        </Suspense>
      ) : null}
      {show ? (
        <Suspense
          fallback={
            <div className="h-[750px]">
              <LoadingState />
            </div>
          }
        >
          <ErrorBoundary fallback={() => <></>}>
            <Medalists />
          </ErrorBoundary>
        </Suspense>
      ) : null}
    </div>
  );
};
