import { PlusOutlined, MinusOutlined } from "@ant-design/icons";
import { ZoomInSideBarButton } from "./ZoomInSideBarButton";
import { ZoomOutSideBarButton } from "./ZoomOutSideBarButton";

export const MapZoomSideBar = () => {
  return (
    <div className="container touch-none">
      <ZoomInSideBarButton key="zoom-in">
        <PlusOutlined />
      </ZoomInSideBarButton>
      <ZoomOutSideBarButton key="zoom-out">
        <MinusOutlined />
      </ZoomOutSideBarButton>

      <style jsx>{`
        .container {
          position: fixed;
          bottom: 37px;
          right: 20px;
          display: flex;
          flex-direction: column;
          user-select: none;
        }
      `}</style>
    </div>
  );
};
