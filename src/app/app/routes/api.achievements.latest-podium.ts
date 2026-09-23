import { withDb } from "@/server-lib/db/middleware";
import { getLatestPodium } from "@/server-lib/fn/achievement";
import { withCore } from "@/server-lib/middleware";
import type { Route } from "./+types/api.achievements.latest-podium";

export const loader = withCore(
  withDb(async (_args: Route.LoaderArgs, { db }) => {
    return Response.json(await getLatestPodium(db));
  }),
);
