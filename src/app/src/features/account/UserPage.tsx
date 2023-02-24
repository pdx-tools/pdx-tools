import React from "react";
import { PageHeader, Spin, Descriptions } from "antd";
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

  let extras = [];
  if (userQuery.isFetching) {
    extras.push(<Spin key="myid" size="small" />);
  }

  const user = userQuery.data;
  if (user == null || user.user_info == null) {
    return null;
  }

  return (
    <div>
      <Head>
        <title>{user.user_info.user_name} saves - PDX Tools</title>
      </Head>
      <PageHeader
        avatar={{
          shape: "square",
        }}
        title={`${user.user_info.user_name || `User: ${userId}`}`}
        extra={[extras]}
      >
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="Joined">
            <TimeAgo date={user.user_info.created_on} />
          </Descriptions.Item>
        </Descriptions>

        <UserSaveTable isPrivileged={isPrivileged} records={user.saves} />
      </PageHeader>
    </div>
  );
};
