import React, { useState } from "react";
import {
  SideBarButton,
  SideBarButtonProps,
} from "@/features/eu4/components/SideBarButton";
import { VisualizationProvider } from "@/components/viz/visualization-context";
import { CountryDetailsDrawer } from "./CountryDetailsDrawer";
import { SideBarContainerProvider } from "../../components/SideBarContainer";
import { Tooltip } from "antd";

export const CountrySideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const [drawerVisible, setDrawerVisible] = useState(false);

  return (
    <>
      <VisualizationProvider>
        <SideBarContainerProvider>
          <CountryDetailsDrawer
            visible={drawerVisible}
            closeDrawer={() => setDrawerVisible(false)}
          />
        </SideBarContainerProvider>
      </VisualizationProvider>
      <Tooltip title="Country view" placement="left">
        <SideBarButton {...props} onClick={() => setDrawerVisible(true)}>
          {children}
        </SideBarButton>
      </Tooltip>
    </>
  );
};
