import { fetchAchievement } from "@/server-lib/fn/achievement";
import { withCore } from "@/server-lib/middleware";
import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";

export const Route = createAPIFileRoute("/api/achievements/$achievementId")({
  GET: withCore(async ({ request, params }) => {
    return json(await fetchAchievement(params));
  }),
});
