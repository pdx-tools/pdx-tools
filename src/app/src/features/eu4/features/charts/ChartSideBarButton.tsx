import React, { useState } from "react";
import {
  SideBarButton,
  SideBarButtonProps,
} from "../../components/SideBarButton";
import { VisualizationProvider } from "@/components/viz";
import { ChartDrawer } from "./ChartDrawer";
import { SideBarContainerProvider } from "../../components/SideBarContainer";

export const ChartSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const [drawerVisible, setDrawerVisible] = useState(false);

  return (
    <>
      <VisualizationProvider>
        <SideBarContainerProvider>
          <ChartDrawer
            visible={drawerVisible}
            closeDrawer={() => setDrawerVisible(false)}
          />
        </SideBarContainerProvider>
      </VisualizationProvider>
      <SideBarButton {...props} onClick={() => setDrawerVisible(true)}>
        {children}
      </SideBarButton>
    </>
  );
};
