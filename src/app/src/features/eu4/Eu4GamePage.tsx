import React, { Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { NewestSavesTable } from "./components/NewestSavesTable";
import { DropdownMenu } from "@/components/DropdownMenu";
import { Link } from "@/components/Link";
import { useRouter } from "next/router";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { ErrorBoundary } from "@sentry/nextjs";
import { Alert } from "@/components/Alert";
import { Csr } from "@/components/Csr";
import { LoadingState } from "@/components/LoadingState";

const saves = [
  ["1.29", "/eu4/saves/10loz22jqw1l"],
  ["1.30", "/eu4/saves/zvqrv7lo87g9"],
  ["1.31", "/eu4/saves/s6u655fwi12i"],
  ["1.32", "/eu4/saves/wa9sqd1flyy2"],
  ["1.33", "/eu4/saves/o22v44qsdhif"],
  ["1.34", "/eu4/saves/6h5y5wra5lco"],
  ["1.35", "/eu4/saves/9364azxkhger"],
  ["1.36", "/eu4/saves/2y02s2d41qa2"],
  ["1.37", "/eu4/saves/o0w8pdyw9otf"],
] as const;

export const Eu4GamePage = () => {
  // If someone landed on this page from google, show the "analyze save" button.
  const router = useRouter();
  const isReady = useRef(router.isReady);

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-12 p-5">
      <div className="flex flex-col md:flex-row gap-8">
        <h1 className="text-4xl">Latest EU4 Saves</h1>
        <div className="flex items-center gap-2">
          {!isReady.current ? (
            <Button
              asChild
              className="hover:bg-slate-200 active:bg-slate-300 dark:hover:bg-slate-600"
            >
              <Link variant="ghost" href="/">
                Analyze EU4 Saves
              </Link>
            </Button>
          ) : null}
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
      </div>
      <div className="flex flex-col gap-2">
        <Suspense fallback={<LoadingState />}>
          <ErrorBoundary
            fallback={({ error }) => (
              <div className="m-8">
                <Alert.Error
                  className="px-4 py-2"
                  msg={`Failed to fetch latest saves: ${error}`}
                />
              </div>
            )}
          >
            <Csr>
              <NewestSavesTable />
            </Csr>
          </ErrorBoundary>
        </Suspense>
      </div>
    </div>
  );
};
