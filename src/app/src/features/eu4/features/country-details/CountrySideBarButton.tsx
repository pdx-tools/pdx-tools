import React from "react";
import {
  SideBarButton,
  SideBarButtonProps,
} from "@/features/eu4/components/SideBarButton";
import { VisualizationProvider } from "@/components/viz/visualization-context";
import { CountryDetailsDrawer } from "./CountryDetailsDrawer";
import { SideBarContainerProvider } from "../../components/SideBarContainer";
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
      <SideBarButton {...props} onClick={openCountryDrawer}>
        {children}
      </SideBarButton>
    </>
  );
};
