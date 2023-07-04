import React from "react";
import { Button } from "antd";
import Link from "next/link";
import { NewestSavesTable } from "./components/NewestSavesTable";

export const Eu4GamePage = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-5">
      <h1 className="text-4xl">Latest EU4 Saves</h1>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button size="large">
            <Link href="/">Analyze EU4 Saves</Link>
          </Button>
          <Button size="large">
            <Link href="/eu4/achievements">Available Achievements</Link>
          </Button>
        </div>
        <NewestSavesTable />
      </div>
    </div>
  );
};
