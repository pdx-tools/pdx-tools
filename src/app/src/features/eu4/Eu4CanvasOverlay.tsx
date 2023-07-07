import React from "react";
import {
  InfoCircleOutlined,
  UploadOutlined,
  AreaChartOutlined,
  GlobalOutlined,
  FlagOutlined,
  FileSyncOutlined,
  HomeOutlined,
} from "@ant-design/icons";
import { SaveWarnings } from "./components/SaveWarnings";
import { InfoSideBarButton } from "@/features/eu4/features/info";
import { ChartSideBarButton } from "@/features/eu4/features/charts";
import { CountrySideBarButton } from "@/features/eu4/features/country-details";
import { ProvinceSelectListener } from "./features/map/ProvinceSelectListener";
import { UploadSideBarButton } from "@/features/eu4/features/upload";
import { MapSettingsSideBarButton } from "@/features/eu4/features/settings";
import { MapZoomSideBar } from "./components/zoom";
import Head from "next/head";
import {
  useEu4Actions,
  useEu4Map,
  useEu4MapMode,
  useEu4Meta,
  useIsServerSaveFile,
  useSaveFilename,
  useSelectedDate,
  useWatcher,
} from "./store";
import { useCanvasPointerEvents } from "./hooks/useCanvasPointerEvents";
import { WatchSideBarButton } from "./features/watch";
import { useEngineActions } from "../engine";
import { SideBarButton } from "./components/SideBarButton";
import { MapModeImage } from "./components/map-modes/MapModeImage";
import { MapModeButtonGroup } from "./components/map-modes";
import { useRouter } from "next/router";
import { Tooltip } from "@/components/Tooltip";

export const Eu4CanvasOverlay = () => {
  const router = useRouter();
  const serverFile = useIsServerSaveFile();
  const mapDate = useSelectedDate();
  const meta = useEu4Meta();
  const filename = useSaveFilename();
  const map = useEu4Map();
  const watcher = useWatcher();
  const actions = useEngineActions();
  const mapMode = useEu4MapMode();
  const eu4Actions = useEu4Actions();
  useCanvasPointerEvents(map);

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
              router.push("/");
            }}
          >
            <span className="text-base">Close Save</span>
            <div className="flex h-8 w-8 items-center justify-center">
              <HomeOutlined className="text-[24px]" />
            </div>
          </SideBarButton>
        </div>

        <div className="flex justify-end overflow-hidden whitespace-nowrap pr-3 text-base opacity-60">
          {mapDate.text.slice(0, mapDate.text.indexOf("-"))}
        </div>

        <div className="flex justify-end overflow-hidden whitespace-nowrap">
          <InfoSideBarButton key="info">
            <span className="text-base">Save Info</span>
            <InfoCircleOutlined className="text-[32px]" />
          </InfoSideBarButton>
        </div>

        {!serverFile ? (
          <div className="flex justify-end overflow-hidden whitespace-nowrap">
            <UploadSideBarButton key="upload">
              <span className="text-base">Upload save</span>
              <UploadOutlined className="text-[32px]" />
            </UploadSideBarButton>
          </div>
        ) : null}

        <div className="flex justify-end overflow-hidden whitespace-nowrap">
          <ChartSideBarButton key="chart">
            <span className="text-base">World charts</span>
            <AreaChartOutlined className="text-[32px]" />
          </ChartSideBarButton>
        </div>

        <div className="flex justify-end overflow-hidden whitespace-nowrap">
          <CountrySideBarButton key="data">
            <span className="text-base">Country breakdown</span>
            <FlagOutlined className="text-[32px]" />
          </CountrySideBarButton>
        </div>

        <div className="flex justify-end overflow-hidden whitespace-nowrap">
          <MapSettingsSideBarButton key="settings">
            <span className="text-base">Map / timelapse settings</span>
            <GlobalOutlined className="text-[32px]" />
          </MapSettingsSideBarButton>
        </div>

        {!serverFile ? (
          <div className="flex justify-end overflow-hidden whitespace-nowrap">
            <WatchSideBarButton key="watch">
              <span className="text-base">Watch save</span>
              <FileSyncOutlined className="text-[32px]" />
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
            <div className="fixed bottom-0 left-0 touch-none select-none border-2 border-solid border-black bg-gray-800 p-1">
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
