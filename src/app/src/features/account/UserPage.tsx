import React from "react";
import { useSelector } from "react-redux";
import { PageHeader, Spin, Descriptions } from "antd";
import { UserSaveTable } from "./UserSaveTable";
import { selectIsPrivileged, selectUserInfo } from "./sessionSlice";
import { TimeAgo } from "../../components/TimeAgo";
import { appApi } from "../../services/appApi";
import Head from "next/head";

interface UserRouteProps {
  userId: string;
}

export const UserPage = ({ userId }: UserRouteProps) => {
  const { isFetching, data } = appApi.endpoints.getUser.useQuery(userId);
  const user = data;
  const userInfo = useSelector(selectUserInfo);
  const privilege = useSelector(selectIsPrivileged);
  const isPrivileged = privilege || userId == userInfo?.user_id;

  let extras = [];
  if (isFetching) {
    extras.push(<Spin key="myid" size="small" />);
  }

  if (user == undefined || user?.user_info == null) {
    return null;
  }

  return (
    <div>
      <Head>
        <title>{user.user_info?.user_name} saves - PDX Tools</title>
      </Head>
      <PageHeader
        avatar={{
          shape: "square",
        }}
        title={`${user.user_info?.user_name || `User: ${userId}`}`}
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
