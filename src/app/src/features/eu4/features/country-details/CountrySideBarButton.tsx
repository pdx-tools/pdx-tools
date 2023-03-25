import React from "react";
import {
  SideBarButton,
  SideBarButtonProps,
} from "@/features/eu4/components/SideBarButton";
import { VisualizationProvider } from "@/components/viz/visualization-context";
import { CountryDetailsDrawer } from "./CountryDetailsDrawer";
import { SideBarContainerProvider } from "../../components/SideBarContainer";
import { Tooltip } from "antd";
import { useEu4Actions } from "../../store";

export const CountrySideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const { openCountryDrawer } = useEu4Actions();

  return (
    <>
      <VisualizationProvider>
        <SideBarContainerProvider>
          <CountryDetailsDrawer />
        </SideBarContainerProvider>
      </VisualizationProvider>
      <Tooltip title="Country view" placement="left">
        <SideBarButton {...props} onClick={openCountryDrawer}>
          {children}
        </SideBarButton>
      </Tooltip>
    </>
  );
};
