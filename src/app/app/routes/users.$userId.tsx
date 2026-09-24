import { WebPage } from "@/components/layout";
import { LoadingState } from "@/components/LoadingState";
import { TimeAgo } from "@/components/TimeAgo";
import { useSession } from "@/features/account";
import { Link } from "@/components/Link";
import { ErrorCatcher, ErrorDisplay } from "@/features/errors";
import { FeedList } from "@/features/saves/FeedList";
import { UserFeaturesPanel } from "@/features/account/UserFeaturesPanel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { hasPermission, userId } from "@/lib/auth";
import { seo } from "@/lib/seo";
import { mediaPreconnectLinks } from "@/lib/media";
import { getUserInfo } from "@/server-lib/db";
import { usingDb } from "@/server-lib/db/connection";
import { getFeed } from "@/server-lib/fn/feed";
import { withCore } from "@/server-lib/middleware";
import { pdxKeys } from "@/services/appApi";
import { Await, useLoaderData } from "react-router";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { Suspense } from "react";
import type { Route } from "./+types/users.$userId";

export const meta = ({ params: { userId } }: Route.MetaArgs) =>
  seo({
    title: "Shared saves - PDX Tools",
    description: `EU4 and EU5 campaigns shared by user ${userId}`,
  });

export const links = () => mediaPreconnectLinks;

const PAGE_SIZE = 25;

export const loader = withCore(async ({ params, context }: Route.LoaderArgs) => {
  const { userId: uid } = params;
  if (!uid) {
    throw new Response("Missing user", {
      status: 400,
    });
  }

  const { db, close } = usingDb(context);
  const queryClient = new QueryClient();
  // The feed streams in after the page. The user row is one primary key
  // lookup, so the page waits for it, and an unknown user gets a 404.
  const prefetch = queryClient
    .fetchInfiniteQuery({
      queryKey: pdxKeys.feed({ user: uid }),
      queryFn: () => getFeed(db, { user: userId(uid), pageSize: PAGE_SIZE, cursor: undefined }),
      retry: false,
      initialPageParam: undefined,
    })
    .then(() => dehydrate(queryClient))
    .finally(() => close());

  try {
    const user = await getUserInfo(db, userId(uid));
    return { user, prefetch };
  } catch (error) {
    // The page fails, so nothing waits for the feed any more.
    prefetch.catch(() => {});
    throw error;
  }
});

export default function UserRoute() {
  const { user, prefetch } = useLoaderData<typeof loader>();
  const session = useSession();

  const isOwner = session.id === user.user_id;
  const canManageFeatures = hasPermission(session, "user:features");
  const userName = user.user_name || `User ${user.user_id}`;
  useDocumentTitle(`${userName} saves - PDX Tools`);

  return (
    <WebPage>
      <div className="mx-auto max-w-5xl">
        <div className="space-y-8 p-5">
          <header>
            <h1 className="text-4xl">{userName}</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Joined <TimeAgo date={user.created_on} />
            </p>
          </header>

          {canManageFeatures && <UserFeaturesPanel userId={user.user_id} />}

          <ErrorCatcher
            fallback={(args) => (
              <ErrorDisplay {...args} className="m-8" title="Failed to load shared saves" />
            )}
          >
            <Suspense fallback={<LoadingState />}>
              <Await resolve={prefetch}>
                {(dehydratedState) => (
                  <HydrationBoundary state={dehydratedState}>
                    <FeedList
                      query={{ user: user.user_id }}
                      showNames
                      empty={<NoCampaigns isOwner={isOwner} userName={userName} />}
                    />
                  </HydrationBoundary>
                )}
              </Await>
            </Suspense>
          </ErrorCatcher>
        </div>
      </div>
    </WebPage>
  );
}

/**
 * Nothing shared yet. The owner is told how sharing starts; a visitor is
 * told there is nothing to see, and where the player's saves would appear.
 */
function NoCampaigns({ isOwner, userName }: { isOwner: boolean; userName: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-400/70 px-6 py-10 text-center">
      {isOwner ? (
        <>
          <p className="text-lg font-semibold">You have not shared a save yet.</p>
          <p className="mx-auto mt-2 max-w-prose text-gray-600 dark:text-gray-400">
            <Link to="/">Drop an EU4 or EU5 save</Link> on the home page, then press the share
            button at the bottom of the sidebar. Every save you share gets a public permalink and
            shows up here, grouped by campaign.
          </p>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold">{userName} has not shared a save yet.</p>
          <p className="mx-auto mt-2 max-w-prose text-gray-600 dark:text-gray-400">
            Shared campaigns and their saves will appear here.
          </p>
        </>
      )}
    </div>
  );
}
