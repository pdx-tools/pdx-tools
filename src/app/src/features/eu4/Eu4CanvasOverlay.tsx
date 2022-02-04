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
import { selectEu4MapDate } from "./eu4Slice";
import { selectModuleDrawn } from "../engine";
import { MapTip } from "./features/map/MapTip";
import { MapZoomSideBar } from "./components/zoom";
import { log } from "@/lib/log";

const { className, styles } = css.resolve`
  span {
    color: #eee;
    font-size: 2.25rem;
  }
`;

export const Eu4CanvasOverlay: React.FC<{}> = () => {
  const hasDrawn = useSelector(selectModuleDrawn);
  const mapDate = useSelector(selectEu4MapDate);
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
      <div className="date-overlay">{mapDate.text}</div>
      <div className="ui-sidebar">
        <div className="flex-col gap">{buttons.map((x, i) => x(i))}</div>
        {styles}
      </div>
      <MapZoomSideBar />
      <MapModeSideBar />
      <ProvinceSelectListener />
      <style jsx>{`
        .ui-sidebar {
          position: fixed;
          right: 0;
          display: flex;
          flex-direction: column;
          user-select: none;
        }

        .date-overlay {
          position: fixed;
          right: 60px;
          height: 60px;
          display: flex;

          // This is the background color in EU4 date
          background-color: #20272c;
          place-items: center;
          color: white;
          padding-left: 1rem;
          padding-right: 1rem;
          font-size: 1.25rem;
          box-shadow: inset 0 0 30px #333;
          font-weight: bold;
          border: 2px solid black;
        }
      `}</style>
      <SaveWarnings />
    </>
  );
};
