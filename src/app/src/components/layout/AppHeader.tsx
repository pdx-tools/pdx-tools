import React from "react";
import Link from "next/link";
import { AppSvg } from "../icons/AppIcon";
import { CoreMenu } from "./CoreMenu";
import { MobileMenu } from "./MobileMenu";
import { AnnouncementBar } from "./AnnouncementBar";
import { useEngineActions } from "@/features/engine";

const HeaderMenu = () => {
  return (
    <>
      <CoreMenu mode="horizontal" className="hidden md:flex" />
      <MobileMenu />
    </>
  );
};

export const CurrentAnnouncement: (() => React.ReactElement) | undefined =
  undefined as unknown as (() => React.ReactElement) | undefined;

export const AppHeader = () => {
  const { resetSaveAnalysis } = useEngineActions();
  return (
    <div className="flex flex-col">
      {CurrentAnnouncement && (
        <AnnouncementBar>
          <CurrentAnnouncement />
        </AnnouncementBar>
      )}

      <div className="h-16 bg-[#001529] px-4">
        <div className="mx-auto flex h-full w-full items-center">
          <Link
            href="/"
            className="mr-3 flex items-center gap-1 text-3xl text-white hover:text-white hover:underline"
            onClick={() => resetSaveAnalysis()}
          >
            <span className="float-left inline-flex">
              <AppSvg width={48} height={48} />
            </span>
            PDX Tools
          </Link>
          <HeaderMenu />
        </div>
      </div>
    </div>
  );
};
