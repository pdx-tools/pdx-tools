import { PlusOutlined, MinusOutlined } from "@ant-design/icons";
import { ZoomInSideBarButton } from "./ZoomInSideBarButton";
import { ZoomOutSideBarButton } from "./ZoomOutSideBarButton";

export const MapZoomSideBar = () => {
  return (
    <div className={`my-3 flex touch-none select-none flex-col`}>
      <div className="flex justify-end overflow-hidden whitespace-nowrap">
        <ZoomInSideBarButton key="zoom-in">
          <span className="text-base">Zoom in</span>
          <div className="flex h-8 w-8 items-center justify-center">
            <PlusOutlined className="text-[24px]" />
          </div>
        </ZoomInSideBarButton>
      </div>
      <div className="flex  justify-end overflow-hidden whitespace-nowrap">
        <ZoomOutSideBarButton key="zoom-out">
          <span className="text-base">Zoom out</span>
          <div className="flex h-8 w-8 items-center justify-center">
            <MinusOutlined className="text-[24px]" />
          </div>
        </ZoomOutSideBarButton>
      </div>
    </div>
  );
};
