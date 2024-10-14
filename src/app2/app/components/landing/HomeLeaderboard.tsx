import { Suspense } from "react";
import { LoadingState } from "../LoadingState";
import { ErrorBoundary } from "@sentry/react";
import { pdxApi } from "@/services/appApi";
import { AchievementPodium } from "@/features/eu4/AchievementPage";
import { cx } from "class-variance-authority";
import { AchievementAvatar } from "@/features/eu4/components/avatars";
import { Link } from "../Link";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";

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
    </div>
  );
};
