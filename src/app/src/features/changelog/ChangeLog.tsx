import React from "react";
import { PageHeader, Typography } from "antd";
import { changes } from "./changes";

const { Title } = Typography;

export const ChangeLog = () => {
  const data = changes.slice().reverse();
  return (
    <PageHeader
      title="Changelog"
      style={{ maxWidth: "650px", margin: "0 auto" }}
    >
      {data.map((x) => {
        return (
          <div key={x.title}>
            <Title id={x.title} level={3}>
              {x.title}
            </Title>
            <div>{x.render()}</div>
          </div>
        );
      })}
    </PageHeader>
  );
};
