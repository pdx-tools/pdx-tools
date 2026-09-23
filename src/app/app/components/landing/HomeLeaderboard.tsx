import { Suspense } from "react";
import { LoadingState } from "../LoadingState";
import { pdxApi } from "@/services/appApi";
import { AchievementPodium } from "@/features/eu4/AchievementPage";
import { cx } from "class-variance-authority";
import { AchievementAvatar } from "@/features/eu4/components/avatars";
import { Link } from "../Link";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { ErrorCatcher } from "@/features/errors";

let globalShow = false;

const HomeLeaderboardImpl = () => {
  const { data: podium } = pdxApi.achievement.useLatestPodium();
  if (podium === null) {
    return null;
  }

  const { achievement, newSaveId } = podium;
  const newestPlaced = podium.saves.some((save) => save.id === newSaveId);

  return (
    <>
      <h3 className="flex flex-col items-center gap-3 text-2xl font-bold">
        <span>Latest podium update:</span>
        <span className="flex items-center gap-2">
          <AchievementAvatar size={40} id={achievement.id} />
          <Link to={`/eu4/achievements/${achievement.id}`}>{achievement.name}</Link>
        </span>
      </h3>
      <AchievementPodium saves={podium.saves} newSaveId={newestPlaced ? newSaveId : undefined} />
    </>
  );
};

export const HomeLeaderboard = () => {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLDivElement>({
    threshold: 0.1,
    rootMargin: "200px",
  });

  const show = (globalShow ||= isIntersecting);

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
          <ErrorCatcher fallback={() => <></>}>
            <HomeLeaderboardImpl />
          </ErrorCatcher>
        </Suspense>
      ) : null}
    </div>
  );
};
