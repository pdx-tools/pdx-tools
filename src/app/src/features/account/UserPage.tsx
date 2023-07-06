import React from "react";
import { UserSaveTable } from "./UserSaveTable";
import { TimeAgo } from "../../components/TimeAgo";
import { useIsPrivileged, useUserQuery } from "../../services/appApi";
import Head from "next/head";

interface UserRouteProps {
  userId: string;
}

export const UserPage = ({ userId }: UserRouteProps) => {
  const userQuery = useUserQuery(userId);
  const isPrivileged = useIsPrivileged(userQuery.data?.user_info?.user_id);

  const user = userQuery.data;
  if (user == null || user.user_info == null) {
    return null;
  }

  return (
    <div>
      <Head>
        <title>{user.user_info.user_name} saves - PDX Tools</title>
      </Head>
      <div className="p-5">
        <h1 className="text-4xl">
          {user.user_info.user_name || `User: ${userId}`}
        </h1>
        <div className="mb-4 space-x-2">
          <span>Joined:</span>
          <TimeAgo date={user.user_info.created_on} />
        </div>

        <UserSaveTable isPrivileged={isPrivileged} records={user.saves} />
      </div>
    </div>
  );
};
