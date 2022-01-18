import React from "react";
import { Button, PageHeader } from "antd";
import Link from "next/link";
import { NewestSavesTable } from "./components/NewestSavesTable";

export const Eu4GamePage: React.FC<{}> = () => {
  return (
    <PageHeader
      title="Latest EU4 saves"
      style={{ maxWidth: "1200px", margin: "0 auto" }}
      footer={
        <div className="flex-col gap">
          <div className="flex-row gap">
            <Button size="large">
              <Link href="/">
                <a>Analyze EU4 Saves</a>
              </Link>
            </Button>
            <Button size="large">
              <Link href="/eu4/achievements">
                <a>Available Achievements</a>
              </Link>
            </Button>
          </div>
          <NewestSavesTable />
        </div>
      }
    />
  );
};
