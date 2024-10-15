import { WebPage } from "@/components/layout";
import { LoadingState } from "@/components/LoadingState";
import { TimeAgo } from "@/components/TimeAgo";
import { useSession } from "@/features/account";
import { UserSaveTable } from "@/features/account/UserSaveTable";
import { dbPool, getUser, saveView, table, toApiSave } from "@/server-lib/db";
import { NotFoundError } from "@/server-lib/errors";
import { sessionSelect } from "@/services/appApi";
import { Await, createFileRoute, defer } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";

const fetchUser = createServerFn("GET", async (userId: string) => {
  return getUser(userId);
});

export const Route = createFileRoute("/users/$userId")({
  loader: ({ params: { userId } }) => {
    return { userPromise: defer(fetchUser(userId)) };
  },
  component: UserComponent,
});

function UserComponent() {
  const { userPromise } = Route.useLoaderData();

  return (
    <WebPage>
      <Await promise={userPromise} fallback={<LoadingState />}>
        {(user) => <UserPage user={user} />}
      </Await>
    </WebPage>
  );
}

function UserPage({ user }: { user: Awaited<ReturnType<typeof fetchUser>> }) {
  const session = useSession();
  const isPrivileged = sessionSelect.isPrivileged(session, {
    user_id: user.user_info.user_id,
  });

  return (
    <div className="mx-auto max-w-5xl">
      {/* <Head>
    <title>{user.user_info.user_name} saves - PDX Tools</title>
  </Head> */}
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
