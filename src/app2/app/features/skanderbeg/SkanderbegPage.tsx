import React, { useMemo } from "react";
import { SkanUserSavesTable } from "./SkanUserSavesTable";
import { useRouter } from "next/router";
import { extractSaveId } from "./skanUrl";
import { pdxApi } from "../../services/appApi";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Link } from "@/components/Link";
import { LoggedIn } from "@/components/LoggedIn";

function SkanTable() {
  const skanQuery = pdxApi.session.useSkanderbegSaves();
  const data = useMemo(() => skanQuery.data ?? [], [skanQuery.data]);
  return <SkanUserSavesTable records={data} />;
}

export const SkanderbegPage = () => {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <h1 className="text-4xl">Skanderbeg</h1>
      <div className="space-y-5">
        <p className="max-w-prose">
          <Link href="https://skanderbeg.pm">Skanderbeg</Link> is site dedicated
          to generating beautiful maps and insightful data tables. To analyze a
          Skanderbeg save in PDX Tools, upload the save to Skanderbeg and copy
          and paste either a Skanderbeg URL or the save id. Ironman saves
          uploaded to Skanderbeg will not work in PDX Tools.
        </p>
        <div className="flex flex-col gap-2">
          <form
            className="flex max-w-prose space-x-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              const values = Object.fromEntries(new FormData(ev.currentTarget));
              router.push(
                `/eu4/skanderbeg/${extractSaveId(values["id"] as string)}`,
              );
            }}
          >
            <Input
              name="id"
              placeholder="Skanderbeg URL or id"
              className="h-10 px-3 py-2"
            />
            <Button type="submit" variant="primary">
              Analyze
            </Button>
          </form>
          <LoggedIn>
            <SkanTable />
          </LoggedIn>
        </div>
      </div>
    </div>
  );
};
