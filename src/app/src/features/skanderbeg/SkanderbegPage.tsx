import React from "react";
import { Input } from "antd";
import { SkanUserSavesTable } from "./SkanUserSavesTable";
import { useRouter } from "next/router";
import { extractSaveId } from "./skanUrl";
import { useProfileQuery, useUserSkanderbegSaves } from "../../services/appApi";
const { Search } = Input;

function SkanTable() {
  const skanQuery = useUserSkanderbegSaves();
  return (
    <SkanUserSavesTable
      loading={skanQuery.isFetching}
      records={skanQuery.data ?? []}
    />
  );
}

export const SkanderbegPage = () => {
  const router = useRouter();
  const profileQuery = useProfileQuery();
  const isLoggedInUser = !(
    profileQuery.data === undefined || profileQuery.data.kind === "guest"
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <h1 className="text-4xl">Skanderbeg</h1>
      <div className="space-y-5">
        <p className="max-w-prose">
          <a href="https://skanderbeg.pm">Skanderbeg</a> is site dedicated to
          generating beautiful maps and insightful data tables. To analyze a
          Skanderbeg save in PDX Tools, upload the save to Skanderbeg and copy
          and paste either a Skanderbeg URL or the save id. Ironman saves
          uploaded to Skanderbeg will not work in PDX Tools.
        </p>
        <div className="flex flex-col gap-2">
          <Search
            className="max-w-prose"
            placeholder="Skanderbeg URL or id"
            enterButton="Analyze"
            size="large"
            onSearch={(inp: string) =>
              router.push(`/eu4/skanderbeg/${extractSaveId(inp)}`)
            }
          />
          {isLoggedInUser ? <SkanTable /> : null}
        </div>
      </div>
    </div>
  );
};
