import React from "react";
import { UserSaveTable } from "./UserSaveTable";
import { TimeAgo } from "../../components/TimeAgo";
import { pdxApi, sessionSelect } from "../../services/appApi";
import Head from "next/head";
import { Alert } from "@/components/Alert";

interface UserRouteProps {
  userId: string;
}

export const UserPage = ({ userId }: UserRouteProps) => {
  const userQuery = pdxApi.user.useGet(userId);
  const session = pdxApi.session.useCurrent();
  if (userQuery.error) {
    return <Alert.Error className="px-4 py-2" msg={userQuery.error} />
  }

  const user = userQuery.data;
  if (user == null || user.user_info == null) {
    return null;
  }

  const isPrivileged = sessionSelect.isPrivileged(session, {
    user_id: user.user_info.user_id,
  });

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

        <UserSaveTable isPrivileged={isPrivileged} saves={user.saves} />
      </div>
    </div>
  );
};
