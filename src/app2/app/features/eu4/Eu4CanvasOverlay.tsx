import React from "react";
import { SaveWarnings } from "./components/SaveWarnings";
import { InfoSideBarButton } from "@/features/eu4/features/info";
import { ChartSideBarButton } from "@/features/eu4/features/charts";
import { CountrySideBarButton } from "@/features/eu4/features/country-details";
import { ProvinceSelectListener } from "./features/map/ProvinceSelectListener";
import { UploadSideBarButton } from "@/features/eu4/features/upload";
import { MapZoomSideBar } from "./components/zoom";
import Head from "next/head";
import {
  useEu4Actions,
  useEu4Map,
  useEu4MapMode,
  useEu4Meta,
  useIsServerSaveFile,
  useSaveFilename,
  useWatcher,
} from "./store";
import { WatchSideBarButton } from "./features/watch";
import { useEngineActions } from "../engine";
import { SideBarButton } from "./components/SideBarButton";
import { MapModeImage } from "./components/map-modes/MapModeImage";
import { MapModeButtonGroup } from "./components/map-modes";
import { Tooltip } from "@/components/Tooltip";
import {
  ArrowUpTrayIcon,
  FlagIcon,
  HomeIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { ChartAreaIcon } from "@/components/icons/ChartAreaIcon";
import { FileSyncIcon } from "@/components/icons/FileSyncIcon";

export const Eu4CanvasOverlay = () => {
  const serverFile = useIsServerSaveFile();
  const meta = useEu4Meta();
  const filename = useSaveFilename();
  const watcher = useWatcher();
  const actions = useEngineActions();
  const mapMode = useEu4MapMode();
  const eu4Actions = useEu4Actions();

  return (
    <>
      <Head>
        <title>{`${filename.replace(".eu4", "")} (${meta.date}) - EU4 (${
          meta.savegame_version.first
        }.${meta.savegame_version.second}.${
          meta.savegame_version.third
        }) - PDX Tools`}</title>
      </Head>
      <div className="flex h-full flex-col gap-2 py-4 text-white">
        <div className="flex justify-end overflow-hidden whitespace-nowrap">
          <SideBarButton
            key="header"
            onClick={() => {
              actions.resetSaveAnalysis();
              // router.push("/");
            }}
          >
            <span className="text-base">Close Save</span>
            <div className="flex h-8 w-8 items-center justify-center">
              <HomeIcon className="h-8 w-8 stroke-2" />
            </div>
          </SideBarButton>
        </div>

        <div className="flex justify-end overflow-hidden whitespace-nowrap">
          <InfoSideBarButton key="info">
            <span className="text-base">Save Info</span>
            <InformationCircleIcon className="h-8 w-8 stroke-2" />
          </InfoSideBarButton>
        </div>

        {!serverFile ? (
          <div className="flex justify-end overflow-hidden whitespace-nowrap">
            <UploadSideBarButton key="upload">
              <span className="text-base">Upload save</span>
              <ArrowUpTrayIcon className="h-8 w-8 stroke-2" />
            </UploadSideBarButton>
          </div>
        ) : null}

        <div className="flex justify-end overflow-hidden whitespace-nowrap">
          <ChartSideBarButton key="chart">
            <span className="text-base">World charts</span>
            <ChartAreaIcon className="h-8 w-8" />
          </ChartSideBarButton>
        </div>

        <div className="flex justify-end overflow-hidden whitespace-nowrap">
          <CountrySideBarButton key="data">
            <span className="text-base">Country breakdown</span>
            <FlagIcon className="h-8 w-8 stroke-2" />
          </CountrySideBarButton>
        </div>

        {!serverFile ? (
          <div className="flex justify-end overflow-hidden whitespace-nowrap">
            <WatchSideBarButton key="watch">
              <span className="text-base">Watch save</span>
              <FileSyncIcon className="h-8 w-8" />
            </WatchSideBarButton>
          </div>
        ) : null}

        <div className="grow"></div>
        <MapZoomSideBar />
        <div className="flex justify-end overflow-hidden whitespace-nowrap">
          <MapModeButtonGroup />
          <MapModeImage
            className="mx-2 transition-all duration-100 hover:brightness-200"
            mode={mapMode}
            onClick={() => eu4Actions.nextMapMode()}
          />
        </div>
      </div>
      {watcher.status != "idle" ? (
        <Tooltip>
          <Tooltip.Trigger>
            <div className="fixed left-0 top-0 touch-none select-none border-2 border-solid border-black bg-gray-800 p-1">
              <div className="h-[56px] w-[56px] rounded-full bg-teal-500"></div>
            </div>
          </Tooltip.Trigger>
          <Tooltip.Content>Save watcher: {watcher.status}</Tooltip.Content>
        </Tooltip>
      ) : null}
      <ProvinceSelectListener />
      <SaveWarnings />
    </>
  );
};
