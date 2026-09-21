import { withDb } from "@/server-lib/db/middleware";
import { CampaignSchema, getCampaignSaves } from "@/server-lib/fn/feed";
import { withCore } from "@/server-lib/middleware";
import type { Route } from "./+types/api.campaign";

export type CampaignResponse = Awaited<ReturnType<typeof getCampaignSaves>>;

export const loader = withCore(
  withDb(async ({ request }: Route.LoaderArgs, { db }) => {
    const searchParams = new URL(request.url).searchParams;
    const params = CampaignSchema.parse(Object.fromEntries(searchParams.entries()));
    return Response.json(await getCampaignSaves(db, params));
  }),
);
