import { Suspense, useEffect, useRef, useState } from "react";
import { LoadingState } from "../LoadingState";
import { ErrorBoundary } from "@sentry/nextjs";
import { pdxApi } from "@/services/appApi";
import { AchievementPodium } from "@/features/eu4/AchievementPage";
import { cx } from "class-variance-authority";
import { AchievementAvatar } from "@/features/eu4/components/avatars";
import { Link } from "../Link";

let globalShow = false;

const HomeLeaderboardImpl = () => {
  const achievementId = "348";
  const achievementQuery = pdxApi.achievement.useGet(achievementId);
  if (achievementQuery.data.saves.length < 3) {
    return null;
  }

  return (
    <>
      <h3 className="flex flex-col text-2xl font-bold items-center gap-3">
        <p>Featured leaderboard:</p>
        <div className="flex gap-2 items-center">
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
  const [show, setShow] = useState(globalShow);
  const watchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!watchRef.current) {
      return;
    }

    const intersection = new IntersectionObserver(
      (ent) => {
        globalShow ||= ent[0].isIntersecting;
        setShow(globalShow);
      },
      {
        threshold: 0.1,
        rootMargin: "200px",
      },
    );

    intersection.observe(watchRef.current);
    return () => {
      intersection.disconnect();
    };
  }, []);

  return (
    <div ref={watchRef} className={cx(!show && "h-[750px]")}>
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
