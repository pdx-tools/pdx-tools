import { WebPage } from "@/components/layout";
import { LoadingState } from "@/components/LoadingState";
import { TimeAgo } from "@/components/TimeAgo";
import { useSession } from "@/features/account";
import { CampaignList, NoCampaigns, useCampaigns } from "@/features/account/CampaignList";
import { UserFeaturesPanel } from "@/features/account/UserFeaturesPanel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { hasPermission, userId } from "@/lib/auth";
import { formatInt } from "@/lib/format";
import { seo } from "@/lib/seo";
import { mediaPreconnectLinks } from "@/lib/media";
import { getUser } from "@/server-lib/db";
import { usingDb } from "@/server-lib/db/connection";
import { withCore } from "@/server-lib/middleware";
import { pdxApi, pdxKeys } from "@/services/appApi";
import { Await, useLoaderData, useParams } from "react-router";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { Suspense } from "react";
import type { Route } from "./+types/users.$userId";

export const meta = ({ params: { userId } }: Route.MetaArgs) =>
  seo({
    title: "Shared saves - PDX Tools",
    description: `EU4 and EU5 campaigns shared by user ${userId}`,
  });

export const links = () => mediaPreconnectLinks;

export const loader = withCore(async ({ params, context }: Route.LoaderArgs) => {
  const { userId: uid } = params;
  if (!uid) {
    throw new Response("Missing user", {
      status: 400,
    });
  }

  const { db, close } = usingDb(context);
  const queryClient = new QueryClient();
  const prefetch = queryClient
    .fetchQuery({
      queryKey: pdxKeys.user(uid),
      queryFn: () => getUser(db, userId(uid)),
      retry: false,
    })
    .then(() => dehydrate(queryClient))
    .finally(() => close());

  return {
    prefetch,
  };
});

export default function UserRoute() {
  const { prefetch } = useLoaderData<typeof loader>();
  const { userId } = useParams();

  return (
    <WebPage>
      <Suspense fallback={<LoadingState />}>
        <Await resolve={prefetch}>
          {(dehydratedState) => (
            <HydrationBoundary state={dehydratedState}>
              <UserPage userId={userId!} />
            </HydrationBoundary>
          )}
        </Await>
      </Suspense>
    </WebPage>
  );
}

function UserPage({ userId }: { userId: string }) {
  const { data: user } = pdxApi.user.useGet(userId);
  const session = useSession();
  const campaigns = useCampaigns(user);

  const isOwner = session.id === user.user_info.user_id;
  const isPrivileged = hasPermission(session, "savefile:delete", {
    userId: user.user_info.user_id,
  });
  const canManageFeatures = hasPermission(session, "user:features");
  const userName = user.user_info.user_name || `User ${user.user_info.user_id}`;
  useDocumentTitle(`${userName} saves - PDX Tools`);

  const saveCount = user.saves.length + user.eu5_saves.length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="space-y-8 p-5">
        <header>
          <h1 className="text-4xl">{userName}</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Joined <TimeAgo date={user.user_info.created_on} />
            {saveCount > 0 && (
              <>
                <span className="mx-2 text-gray-400">·</span>
                <span className="tabular-nums">
                  {formatInt(campaigns.length)} {campaigns.length === 1 ? "campaign" : "campaigns"}
                </span>
                <span className="mx-2 text-gray-400">·</span>
                <span className="tabular-nums">
                  {formatInt(saveCount)} {saveCount === 1 ? "save" : "saves"}
                </span>
              </>
            )}
          </p>
        </header>

        {canManageFeatures && <UserFeaturesPanel userId={user.user_info.user_id} />}

        {campaigns.length === 0 ? (
          <NoCampaigns isOwner={isOwner} userName={userName} />
        ) : (
          <CampaignList campaigns={campaigns} canDeleteSaves={isPrivileged} />
        )}
      </div>
    </div>
  );
}
