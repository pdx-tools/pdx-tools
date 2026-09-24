import { withDb } from "@/server-lib/db/middleware";
import { FeedSchema, getFeed } from "@/server-lib/fn/feed";
import { withCore } from "@/server-lib/middleware";
import type { Route } from "./+types/api.feed";

export type FeedResponse = Awaited<ReturnType<typeof getFeed>>;

export const loader = withCore(
  withDb(async ({ request }: Route.LoaderArgs, { db }) => {
    const searchParams = new URL(request.url).searchParams;
    const params = FeedSchema.parse(Object.fromEntries(searchParams.entries()));
    return Response.json(await getFeed(db, params));
  }),
);
