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
import css from "styled-jsx/css";
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

const { className, styles } = css.resolve`
  span {
    color: #eee;
    font-size: 2.25rem;
  }
`;

export const Eu4CanvasOverlay = () => {
  const hasDrawn = useSelector(selectModuleDrawn);
  const serverFile = useAppSelector((state) => state.eu4.serverSaveFile);

  const buttons = [
    (i: number) => (
      <HeaderSideBarButton key="header" index={i}>
        <MenuOutlined className={className} />
      </HeaderSideBarButton>
    ),
    (i: number) => (
      <InfoSideBarButton key="info" index={i}>
        <InfoCircleOutlined className={className} />
      </InfoSideBarButton>
    ),
    ...(serverFile
      ? []
      : [
          (i: number) => (
            <UploadSideBarButton key="upload" index={i}>
              <UploadOutlined className={className} />
            </UploadSideBarButton>
          ),
        ]),
    (i: number) => (
      <ChartSideBarButton key="chart" index={i}>
        <AreaChartOutlined className={className} />
      </ChartSideBarButton>
    ),
    (i: number) => (
      <CountrySideBarButton key="data" index={i}>
        <FlagOutlined className={className} />
      </CountrySideBarButton>
    ),
    (i: number) => (
      <MapSettingsSideBarButton key="settings" index={i}>
        <GlobalOutlined className={className} />
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
      <div className="fixed select-none touch-none right-0">
        <div className="flex flex-col gap-2">{buttons.map((x, i) => x(i))}</div>
        {styles}
      </div>
      <MapZoomSideBar />
      <MapModeSideBar />
      <ProvinceSelectListener />
      <SaveWarnings />
    </>
  );
};
