import { PlusOutlined, MinusOutlined } from "@ant-design/icons";
import { ZoomInSideBarButton } from "./ZoomInSideBarButton";
import { ZoomOutSideBarButton } from "./ZoomOutSideBarButton";
import classes from "./MapZoomSideBar.module.css";

export const MapZoomSideBar = () => {
  return (
    <div
      className={`fixed flex flex-col select-none touch-none ${classes.sidebar}`}
    >
      <ZoomInSideBarButton key="zoom-in">
        <PlusOutlined />
      </ZoomInSideBarButton>
      <ZoomOutSideBarButton key="zoom-out">
        <MinusOutlined />
      </ZoomOutSideBarButton>
    </div>
  );
};
