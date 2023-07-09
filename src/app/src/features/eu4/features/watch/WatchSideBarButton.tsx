import React, { useState } from "react";
import {
  SideBarButtonProps,
  SideBarButton,
} from "../../components/SideBarButton";
import { SideBarContainerProvider } from "../../components/SideBarContainer";
import { WatchDrawer } from "./WatchDrawer";

export const WatchSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const [drawerVisible, setDrawerVisible] = useState(false);

  return (
    <>
      <SideBarContainerProvider>
        <WatchDrawer
          visible={drawerVisible}
          closeDrawer={() => setDrawerVisible(false)}
        />
      </SideBarContainerProvider>
      <SideBarButton {...props} onClick={() => setDrawerVisible(true)}>
        {children}
      </SideBarButton>
    </>
  );
};
