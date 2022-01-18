import React, { useState } from "react";
import {
  SideBarButton,
  SideBarButtonProps,
} from "@/features/eu4/components/SideBarButton";
import { VisualizationProvider } from "@/components/viz/visualization-context";
import { CountryDetailsDrawer } from "./CountryDetailsDrawer";
import { SideBarContainerProvider } from "../../components/SideBarContainer";

export const CountrySideBarButton: React.FC<SideBarButtonProps> = ({
  children,
  ...props
}) => {
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
      <SideBarButton {...props} onClick={() => setDrawerVisible(true)}>
        {children}
      </SideBarButton>
    </>
  );
};
