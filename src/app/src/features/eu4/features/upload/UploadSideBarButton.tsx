import React, { useState } from "react";
import {
  SideBarButtonProps,
  SideBarButton,
} from "@/features/eu4/components/SideBarButton";
import { UploadProvider } from "./uploadContext";
import { UploadDrawer } from "./UploadDrawer";
import { SideBarContainerProvider } from "../../components/SideBarContainer";

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
      <SideBarButton {...props} onClick={() => setDrawerVisible(true)}>
        {children}
      </SideBarButton>
    </>
  );
};
