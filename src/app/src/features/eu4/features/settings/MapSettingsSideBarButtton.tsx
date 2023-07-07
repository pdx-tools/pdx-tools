import React from "react";
import {
  SideBarButtonProps,
  SideBarButton,
} from "../../components/SideBarButton";
import {
  SideBarContainerProvider,
  useSideBarContainerRef,
} from "../../components/SideBarContainer";
import { Sheet } from "@/components/Sheet";
import { MapSettings } from "./MapSettings";

export const MapSettingsSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  return (
    <Sheet modal={false}>
      <Sheet.Trigger asChild>
        <SideBarButton {...props}>{children}</SideBarButton>
      </Sheet.Trigger>

      <SideBarContainerProvider>
        <MapSettingsContent />
      </SideBarContainerProvider>
    </Sheet>
  );
};

const MapSettingsContent = () => {
  const sideBarContainerRef = useSideBarContainerRef();

  return (
    <Sheet.Content
      ref={sideBarContainerRef}
      side="right"
      onInteractOutside={(e) => e.preventDefault()}
      className="flex w-[400px] max-w-full flex-col bg-white py-4"
    >
      <Sheet.Header className="z-10 px-4 pb-4 shadow-md">
        <Sheet.Close />
        <Sheet.Title>Map Settings</Sheet.Title>
      </Sheet.Header>
      <Sheet.Body className="flex flex-col gap-2 px-4 pt-6">
        <MapSettings />
      </Sheet.Body>
    </Sheet.Content>
  );
};
