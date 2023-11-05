import React from "react";
import { Button } from "@/components/Button";
import { NewestSavesTable } from "./components/NewestSavesTable";
import { DropdownMenu } from "@/components/DropdownMenu";
import { Link } from "@/components/Link";

const saves = [
  ["1.29", "/eu4/saves/10loz22jqw1l"],
  ["1.30", "/eu4/saves/zvqrv7lo87g9"],
  ["1.31", "/eu4/saves/s6u655fwi12i"],
  ["1.32", "/eu4/saves/wa9sqd1flyy2"],
  ["1.33", "/eu4/saves/o22v44qsdhif"],
  ["1.34", "/eu4/saves/6h5y5wra5lco"],
  ["1.35", "/eu4/saves/9364azxkhger"],
] as const;

export const Eu4GamePage = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-5">
      <h1 className="text-4xl">Latest EU4 Saves</h1>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button asChild className="hover:bg-slate-200 active:bg-slate-300">
            <Link variant="ghost" href="/">
              Analyze EU4 Saves
            </Link>
          </Button>
          <Button asChild className="hover:bg-slate-200 active:bg-slate-300">
            <Link variant="ghost" href="/eu4/achievements">
              Available Achievements
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button>1444 saves</Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="w-24">
              {saves.map(([patch, url]) => (
                <DropdownMenu.Item key={patch} asChild>
                  <Link target="_blank" href={url} className="justify-center">
                    {patch}
                  </Link>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>
        <NewestSavesTable />
      </div>
    </div>
  );
};
