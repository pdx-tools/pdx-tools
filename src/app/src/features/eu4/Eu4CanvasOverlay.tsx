import React from "react";
import {
  InfoCircleOutlined,
  UploadOutlined,
  AreaChartOutlined,
  GlobalOutlined,
  FlagOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import { useSelector } from "react-redux";
import { HeaderSideBarButton } from "./components/HeaderSideBarButton";
import { SaveWarnings } from "./components/SaveWarnings";
import { MapModeSideBar } from "./components/map-modes/MapModeBar";
import { useAppSelector } from "@/lib/store";
import { InfoSideBarButton } from "@/features/eu4/features/info";
import { ChartSideBarButton } from "@/features/eu4/features/charts";
import { CountrySideBarButton } from "@/features/eu4/features/country-details";
import { ProvinceSelectListener } from "./features/map/ProvinceSelectListener";
import { UploadSideBarButton } from "@/features/eu4/features/upload";
import { MapSettingsSideBarButton } from "@/features/eu4/features/settings";
import { selectModuleDrawn } from "../engine";
import { MapTip } from "./features/map/MapTip";
import { MapZoomSideBar } from "./components/zoom";
import { DateOverlay } from "./components/DateOverlay";

export const Eu4CanvasOverlay = () => {
  const hasDrawn = useSelector(selectModuleDrawn);
  const serverFile = useAppSelector((state) => state.eu4.serverSaveFile);

  const buttons = [
    (i: number) => (
      <HeaderSideBarButton key="header" index={i}>
        <MenuOutlined />
      </HeaderSideBarButton>
    ),
    (i: number) => (
      <InfoSideBarButton key="info" index={i}>
        <InfoCircleOutlined />
      </InfoSideBarButton>
    ),
    ...(serverFile
      ? []
      : [
          (i: number) => (
            <UploadSideBarButton key="upload" index={i}>
              <UploadOutlined />
            </UploadSideBarButton>
          ),
        ]),
    (i: number) => (
      <ChartSideBarButton key="chart" index={i}>
        <AreaChartOutlined />
      </ChartSideBarButton>
    ),
    (i: number) => (
      <CountrySideBarButton key="data" index={i}>
        <FlagOutlined />
      </CountrySideBarButton>
    ),
    (i: number) => (
      <MapSettingsSideBarButton key="settings" index={i}>
        <GlobalOutlined />
      </MapSettingsSideBarButton>
    ),
  ];

  if (!hasDrawn) {
    return null;
  }

  return (
    <>
      <MapTip />
      <DateOverlay />
      <div className="fixed right-0 touch-none select-none">
        <div className="flex flex-col gap-2 text-4xl text-white">
          {buttons.map((x, i) => x(i))}
        </div>
      </div>
      <MapZoomSideBar />
      <MapModeSideBar />
      <ProvinceSelectListener />
      <SaveWarnings />
    </>
  );
};
