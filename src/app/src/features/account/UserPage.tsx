import React from "react";
import { Descriptions } from "antd";
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
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="Joined">
            <TimeAgo date={user.user_info.created_on} />
          </Descriptions.Item>
        </Descriptions>

        <div className="mt-5"></div>
        <UserSaveTable isPrivileged={isPrivileged} records={user.saves} />
      </div>
    </div>
  );
};
