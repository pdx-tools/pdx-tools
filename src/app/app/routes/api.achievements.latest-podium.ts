import { withDb } from "@/server-lib/db/middleware";
import { getLatestPodium } from "@/server-lib/fn/achievement";
import { withCore } from "@/server-lib/middleware";
import type { Route } from "./+types/api.achievements.latest-podium";

export const loader = withCore(
  withDb(async (_args: Route.LoaderArgs, { db }) => {
    // A podium changes only when a run places, so a minute old is fresh
    // enough for the landing page.
    return Response.json(await getLatestPodium(db), {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  }),
);
