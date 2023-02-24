import React, { useMemo } from "react";
import { PageHeader, Typography, Spin } from "antd";
import type { Route } from "antd/es/breadcrumb/Breadcrumb";
import Link from "next/link";
import { RecordTable } from "./components/RecordTable";
import { Achievement, useAchievementQuery } from "@/services/appApi";
const { Paragraph } = Typography;

interface AchievementRoute {
  achievementId: string;
  staticAchievement?: Achievement;
}

const useAchievement = (achievementId: string) => {
  const achievementQuery = useAchievementQuery(achievementId);
  const achievement = achievementQuery.data?.achievement;
  const saves = useMemo(
    () =>
      (achievementQuery.data?.saves ?? []).map((x, i) => ({
        ...x,
        rank: i + 1,
      })),
    [achievementQuery.data]
  );

  return { isFetching: achievementQuery.isFetching, achievement, saves };
};

export const AchievementPage = ({
  achievementId,
  staticAchievement,
}: AchievementRoute) => {
  const { isFetching, achievement, saves } = useAchievement(achievementId);

  const routes = [
    {
      path: "/eu4/achievements",
      breadcrumbName: "Achievements",
    },
  ];

  const itemRender = (
    route: Route,
    params: any,
    routes: Route[],
    paths: string[]
  ) => {
    return <Link href={`/${paths.join("/")}`}>{route.breadcrumbName}</Link>;
  };

  let extras = [];
  if (isFetching) {
    extras.push(<Spin key="spinner" size="small" />);
  }

  const title = achievement?.name ?? staticAchievement?.name ?? "";
  const table = saves === undefined ? null : <RecordTable records={saves} />;
  const description =
    achievement?.description ?? staticAchievement?.description ?? "";

  return (
    <PageHeader
      avatar={{
        size: "large",
        shape: "square",
        src: require(`../../images/eu4/achievements/${achievementId}.png`),
      }}
      title={title}
      breadcrumb={{ routes, itemRender }}
      subTitle={`Achievement id: ${achievementId}`}
      extra={[extras]}
      style={{ maxWidth: "1200px", margin: "0 auto" }}
    >
      <Paragraph>{description}</Paragraph>
      {table}
    </PageHeader>
  );
};
