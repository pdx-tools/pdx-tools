import React, { useState } from "react";
import {
  SideBarButtonProps,
  SideBarButton,
} from "@/features/eu4/components/SideBarButton";
import { UploadProvider } from "./uploadContext";
import { UploadDrawer } from "./UploadDrawer";
import { SideBarContainerProvider } from "../../components/SideBarContainer";
import { Tooltip } from "antd";

export const UploadSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const [drawerVisible, setDrawerVisible] = useState(false);

  return (
    <>
      <UploadProvider>
        <SideBarContainerProvider>
          <UploadDrawer
            visible={drawerVisible}
            closeDrawer={() => setDrawerVisible(false)}
          />
        </SideBarContainerProvider>
      </UploadProvider>
      <Tooltip title="Upload save" placement="left">
        <SideBarButton {...props} onClick={() => setDrawerVisible(true)}>
          {children}
        </SideBarButton>
      </Tooltip>
    </>
  );
};
