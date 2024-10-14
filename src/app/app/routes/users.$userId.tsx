import { WebPage } from "@/components/layout";
import { LoadingState } from "@/components/LoadingState";
import { TimeAgo } from "@/components/TimeAgo";
import { useSession } from "@/features/account";
import { UserSaveTable } from "@/features/account/UserSaveTable";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { seo } from "@/lib/seo";
import { getUser } from "@/server-lib/db";
import { usingDb } from "@/server-lib/db/connection";
import { withCore } from "@/server-lib/middleware";
import { pdxApi, pdxKeys, sessionSelect } from "@/services/appApi";
import { defer, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Await, useLoaderData, useParams } from "@remix-run/react";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { Suspense } from "react";

export const meta: MetaFunction = ({ params: { userId } }) =>
  seo({
    title: "User saves - PDX Tools",
    description: `EU4 Saves uploaded by user ${userId}`,
  });

export const loader = withCore(
  async ({ params, context }: LoaderFunctionArgs) => {
    const { userId } = params;
    if (!userId) {
      throw new Response("Missing user", {
        status: 400,
      });
    }

    const { db, close } = usingDb(context);
    const queryClient = new QueryClient();
    const prefetch = queryClient
      .fetchQuery({
        queryKey: pdxKeys.user(userId),
        queryFn: () => getUser(db, userId),
        retry: false,
      })
      .then(() => dehydrate(queryClient))
      .finally(() => close());

    return defer({
      prefetch,
    });
  },
);

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
  const isPrivileged = sessionSelect.isPrivileged(session, {
    user_id: user.user_info.user_id,
  });

  useDocumentTitle(`${user.user_info.user_name} saves - PDX Tools`);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="p-5">
        <h1 className="text-4xl">
          {user.user_info.user_name || `User: ${user.user_info.user_id}`}
        </h1>
        <div className="mb-4 space-x-2">
          <span>Joined:</span>
          <TimeAgo date={user.user_info.created_on} />
        </div>

        <UserSaveTable isPrivileged={isPrivileged} saves={user.saves} />
      </div>
    </div>
  );
}
