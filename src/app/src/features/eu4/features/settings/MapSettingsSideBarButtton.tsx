import React, { useState } from "react";
import {
  SideBarButtonProps,
  SideBarButton,
} from "../../components/SideBarButton";
import { SideBarContainerProvider } from "../../components/SideBarContainer";
import { MapSettingsDrawer } from "./MapSettingsDrawer";

export const MapSettingsSideBarButton: React.FC<SideBarButtonProps> = ({
  children,
  ...props
}) => {
  const [drawerVisible, setDrawerVisible] = useState(false);

  return (
    <>
      <SideBarContainerProvider>
        <MapSettingsDrawer
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
